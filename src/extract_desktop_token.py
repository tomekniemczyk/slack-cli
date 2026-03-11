#!/usr/bin/env python3
"""
Extract Slack xoxc token and d cookie from the Slack desktop app.
Writes SLACK_TOKEN and SLACK_COOKIE_D to .env file.
"""
import sys, re, os, sqlite3, base64, hashlib

def extract_xoxc_token():
    ldb_files = [
        os.path.expanduser('~/.config/Slack/Local Storage/leveldb/000005.ldb'),
    ]
    import glob
    ldb_files += glob.glob(os.path.expanduser('~/.config/Slack/Local Storage/leveldb/*.ldb'))
    
    seen = {}
    for path in ldb_files:
        if not os.path.exists(path): continue
        data = open(path, 'rb').read()
        tokens = re.findall(b'xoxc-[0-9A-Za-z%_-]+', data)
        for t in tokens:
            key = t[:30]
            if key not in seen or len(t) > len(seen[key]):
                seen[key] = t
    
    if not seen:
        return None
    # Return the longest token
    return sorted(seen.values(), key=len)[-1].decode()

def get_slack_keyring_key():
    try:
        import dbus
        bus = dbus.SessionBus()
        service = bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets')
        svc = dbus.Interface(service, 'org.freedesktop.Secret.Service')
        _, session_path = svc.OpenSession('plain', dbus.String('', variant_level=1))
        mgr = dbus.Interface(service, 'org.freedesktop.Secret.Service')
        result = mgr.SearchItems({'xdg:schema': 'chrome_libsecret_os_crypt_password_v2'})
        all_paths = list(result[0]) + list(result[1])
        for item_path in all_paths:
            item_obj = bus.get_object('org.freedesktop.secrets', str(item_path))
            props = dbus.Interface(item_obj, 'org.freedesktop.DBus.Properties')
            attrs = dict(props.Get('org.freedesktop.Secret.Item', 'Attributes'))
            if str(attrs.get('application', '')) == 'Slack':
                item_iface = dbus.Interface(item_obj, 'org.freedesktop.Secret.Item')
                return bytes(item_iface.GetSecret(session_path)[2])
    except Exception as e:
        print(f"  keyring error: {e}", file=sys.stderr)
    return None

def extract_d_cookie(key_raw):
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
    except ImportError:
        print("  cryptography library not available", file=sys.stderr)
        return None

    cookies_path = os.path.expanduser('~/.config/Slack/Cookies')
    if not os.path.exists(cookies_path):
        return None

    conn = sqlite3.connect(cookies_path)
    cur = conn.cursor()
    cur.execute('SELECT encrypted_value FROM cookies WHERE name="d" AND host_key LIKE "%.slack.com%"')
    row = cur.fetchone()
    conn.close()
    if not row:
        return None

    enc_val = bytes(row[0])
    derived = hashlib.pbkdf2_hmac('sha1', key_raw, b'saltysalt', 1, 16)
    payload = enc_val[3:]
    iv = b' ' * 16
    c = Cipher(algorithms.AES(derived), modes.CBC(iv), backend=default_backend())
    d = c.decryptor()
    dec = d.update(payload) + d.finalize()
    pad = dec[-1]
    val = dec[:-pad].decode('utf-8', errors='replace')
    idx = val.find('xoxd')
    return val[idx:] if idx >= 0 else None

def write_env(token, cookie_d):
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
    content = ''
    if os.path.exists(env_path):
        content = open(env_path).read()

    def set_var(content, key, value):
        import re
        if re.search(rf'^{key}=', content, re.MULTILINE):
            return re.sub(rf'^{key}=.*', f'{key}={value}', content, flags=re.MULTILINE)
        return content.rstrip('\n') + ('\n' if content else '') + f'{key}={value}\n'

    content = set_var(content, 'SLACK_TOKEN', token)
    content = set_var(content, 'SLACK_COOKIE_D', cookie_d)
    open(env_path, 'w').write(content)
    print(f"  Written to {env_path}")

if __name__ == '__main__':
    print("🔍 Extracting token from Slack desktop app...")
    
    token = extract_xoxc_token()
    if not token:
        print("❌ xoxc token not found. Is Slack desktop running?")
        sys.exit(1)
    print(f"  ✅ xoxc token found: {token[:30]}...")

    key_raw = get_slack_keyring_key()
    if not key_raw:
        print("❌ Slack encryption key not found in keyring")
        sys.exit(1)
    print(f"  ✅ encryption key found")

    cookie_d = extract_d_cookie(key_raw)
    if not cookie_d:
        print("❌ Could not decrypt d cookie")
        sys.exit(1)
    print(f"  ✅ d cookie found: {cookie_d[:30]}...")

    write_env(token, cookie_d)
    print("✅ Done!")
