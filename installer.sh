#!/usr/bin/env bash

# MonikaShell Portable Installer
# Designed for common Linux distributions.

set -e

# When piped via curl | bash, stdin is the script itself.
# We reconnect stdin to the terminal to allow interactive prompts.
exec < /dev/tty

REPO_URL="https://github.com/AnarchDevelopment/MonikaShell.git"

echo "========================================"
echo "        MonikaShell Installer"
echo "========================================"
echo ""

# 1. Detect User & Root
CURRENT_USER=$(whoami)
DEFAULT_DIR="/home/$CURRENT_USER/MonikaShell"

if [ "$CURRENT_USER" = "root" ]; then
    DEFAULT_DIR="/root/MonikaShell"
    echo "WARNING: Installing under /root is NOT recommended."
    read -p "Are you sure you want to proceed as root? [y/N]: " root_confirm
    case "$root_confirm" in
        [yY][eE][sS]|[yY]) 
            ;;
        *)
            echo "Installation aborted."
            exit 1
            ;;
    esac
fi

# 2. First Admin
read -p "Set a username for your first admin user [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

# Hide password input
prompt="Set a password for your first admin user: "
while IFS= read -p "$prompt" -r -s -n 1 char; do
    if [[ $char == $'\0' ]]; then
        break
    fi
    prompt='*'
    ADMIN_PASS+="$char"
done
echo ""

# 3. Installation Directory
read -p "Server will be installed to [$DEFAULT_DIR]. Proceed? [Y/n/custom_path]: " DIR_CONFIRM
if [[ "$DIR_CONFIRM" =~ ^[nN] ]]; then
    echo "Installation aborted."
    exit 1
elif [[ "$DIR_CONFIRM" != "" && ! "$DIR_CONFIRM" =~ ^[yY] ]]; then
    INSTALL_DIR="$DIR_CONFIRM"
else
    INSTALL_DIR="$DEFAULT_DIR"
fi

# 4. Port Configuration
read -p "Which port should the backend API run on? [8080]: " API_PORT
API_PORT=${API_PORT:-8080}

# 5. Systemd Service
read -p "Create a systemd service for the server to run on boot? [y/N]: " SYSTEMD_CONFIRM

# 6. Site Configuration
read -p "App name? [MonikaShell]: " APP_NAME
APP_NAME=${APP_NAME:-MonikaShell}

read -p "Site URL [http://localhost:$API_PORT]: " SITE_URL
SITE_URL=${SITE_URL:-http://localhost:$API_PORT}

read -p "Site description [My remote terminal panel]: " SITE_DESC
SITE_DESC=${SITE_DESC:-My remote terminal panel}

# 7. Stop After Required Setup
read -p "Basic installation is complete. Would you like to configure appearance settings now? [Y/n]: " APP_CONFIRM
THEME="Dark"
BORDER="8px"
if [[ ! "$APP_CONFIRM" =~ ^[nN] ]]; then
    read -p "What is the desired default theme for the app? [Light/Dark]: " THEME
    THEME=${THEME:-Dark}
    read -p "What is the desired Border Radius for the app? (use 'px' or 'rem') [8px]: " BORDER
    BORDER=${BORDER:-8px}
fi

echo ""
echo "========================================"
echo " Proceeding with installation..."
echo "========================================"
echo ""

# Install dependencies and clone
if ! command -v git &> /dev/null; then
    echo "git is required but not installed. Please install git."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js >= 18."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "npm is required but not installed. Please install npm."
    exit 1
fi

if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists. Assuming update..."
    cd "$INSTALL_DIR"
    git pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "Installing frontend dependencies..."
cd frontend
npm install --production=false
# We would typically run 'npm run build' here for production, but the dev server is fine for now

echo "Installing backend dependencies..."
cd ../backend
npm install

# Setup env for backend
cat << EOF > .env
PORT=$API_PORT
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
APP_NAME=$APP_NAME
SITE_URL=$SITE_URL
SITE_DESC=$SITE_DESC
THEME=$THEME
BORDER_RADIUS=$BORDER
EOF

cd ..

# Optional Systemd setup
SERVICE_NAME="monikashell"
if [[ "$SYSTEMD_CONFIRM" =~ ^[yY] ]]; then
    echo "Setting up systemd service (requires sudo)..."
    SERVICE_FILE="/tmp/monikashell.service"
    cat << EOF > $SERVICE_FILE
[Unit]
Description=MonikaShell Backend
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$(command -v node) index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo mv $SERVICE_FILE /etc/systemd/system/monikashell.service
    sudo systemctl daemon-reload
    sudo systemctl enable monikashell
    sudo systemctl start monikashell
    echo "Service $SERVICE_NAME started."
fi

echo ""
echo "========================================"
echo " Installation complete!"
echo "========================================"
echo ""
echo "MonikaShell is installed at:"
echo "$INSTALL_DIR"
echo ""
if [[ "$SYSTEMD_CONFIRM" =~ ^[yY] ]]; then
    echo "Service:"
    echo "$SERVICE_NAME"
    echo ""
fi
echo "URL:"
echo "$SITE_URL"
echo ""
echo "To start manually, run:"
echo "cd $INSTALL_DIR/backend && node index.js"
