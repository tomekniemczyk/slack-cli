#!/usr/bin/env bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
WRAPPER="$INSTALL_DIR/slackcli"

echo "🔧 Installing slackcli..."

# 1. Install npm dependencies
echo "📦 Installing Node.js dependencies..."
cd "$REPO_DIR"
npm install --silent

# 2. Create ~/.local/bin if needed and add to PATH
mkdir -p "$INSTALL_DIR"

# 3. Create wrapper script
cat > "$WRAPPER" << EOF
#!/usr/bin/env bash
set -e
cd "$REPO_DIR"
exec node "$REPO_DIR/index.js" "\$@"
EOF
chmod +x "$WRAPPER"

# 4. Add ~/.local/bin to PATH if not already there
add_to_path() {
  local file="$1"
  if [ -f "$file" ] && ! grep -q 'HOME/.local/bin' "$file" 2>/dev/null; then
    echo '' >> "$file"
    echo '# slackcli' >> "$file"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$file"
    echo "  ✅ Added ~/.local/bin to PATH in $file"
  fi
}

add_to_path "$HOME/.bashrc"
add_to_path "$HOME/.zshrc"

# 5. Remove old alias if present
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [ -f "$rc" ]; then
    sed -i "/alias slackcli=/d" "$rc"
  fi
done

echo ""
echo "✅ slackcli installed to $WRAPPER"
echo ""
echo "Reload your shell or run:"
echo "  source ~/.bashrc   (bash)"
echo "  source ~/.zshrc    (zsh)"
echo ""
echo "Then use:"
echo "  slackcli --help"
echo "  slackcli import-desktop-token"
