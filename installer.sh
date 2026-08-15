#!/usr/bin/env bash

# MonikaShell Portable Installer
# Designed for common Linux distributions.

set -e

# When piped via curl | bash, stdin is the script itself.
# We append < /dev/tty to read commands to allow interactive prompts.
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
    read -p "Are you sure you want to proceed as root? [y/N]: " root_confirm < /dev/tty
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
read -p "Set a username for your first admin user [admin]: " ADMIN_USER < /dev/tty
ADMIN_USER=${ADMIN_USER:-admin}

# Hide password input
prompt="Set a password for your first admin user: "
while IFS= read -p "$prompt" -r -s -n 1 char < /dev/tty; do
    if [[ $char == $'\0' ]]; then
        break
    fi
    prompt='*'
    ADMIN_PASS+="$char"
done
echo ""

# 3. Installation Directory
read -p "Server will be installed to [$DEFAULT_DIR]. Proceed? [Y/n/custom_path]: " DIR_CONFIRM < /dev/tty
if [[ "$DIR_CONFIRM" =~ ^[nN] ]]; then
    echo "Installation aborted."
    exit 1
elif [[ "$DIR_CONFIRM" != "" && ! "$DIR_CONFIRM" =~ ^[yY] ]]; then
    INSTALL_DIR="$DIR_CONFIRM"
else
    INSTALL_DIR="$DEFAULT_DIR"
fi

# 4. Port Configuration
read -p "Which port should the backend API run on? [8080]: " API_PORT < /dev/tty
API_PORT=${API_PORT:-8080}

# 5. Systemd Service
read -p "Create a systemd service for the server to run on boot? [y/N]: " SYSTEMD_CONFIRM < /dev/tty

# 6. Site Configuration
read -p "App name? [MonikaShell]: " APP_NAME < /dev/tty
APP_NAME=${APP_NAME:-MonikaShell}

read -p "Site URL (e.g., https://shell.example.com) [http://localhost]: " SITE_URL < /dev/tty
SITE_URL=${SITE_URL:-http://localhost}

read -p "Site description [My remote terminal panel]: " SITE_DESC < /dev/tty
SITE_DESC=${SITE_DESC:-My remote terminal panel}

# 7. Stop After Required Setup
read -p "Basic installation is complete. Would you like to configure appearance settings now? [Y/n]: " APP_CONFIRM < /dev/tty
THEME="Dark"
BORDER="8px"
if [[ ! "$APP_CONFIRM" =~ ^[nN] ]]; then
    read -p "What is the desired default theme for the app? [Light/Dark]: " THEME < /dev/tty
    THEME=${THEME:-Dark}
    read -p "What is the desired Border Radius for the app? (use 'px' or 'rem') [8px]: " BORDER < /dev/tty
    BORDER=${BORDER:-8px}
fi

echo ""
echo "========================================"
echo " Proceeding with installation..."
echo "========================================"
echo ""

# Install dependencies
SUDO=""
if [ "$CURRENT_USER" != "root" ]; then
    if ! command -v sudo &> /dev/null; then
        echo "sudo is not installed. We need root privileges to install dependencies."
        exit 1
    fi
    SUDO="sudo"
fi

install_deps() {
    echo "Installing required dependencies (git, nodejs)..."
    if command -v apt-get &> /dev/null; then
        $SUDO apt-get update
        if ! command -v curl &> /dev/null; then
            $SUDO apt-get install -y curl
        fi
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        $SUDO apt-get install -y nodejs git build-essential python3-dev
    elif command -v dnf &> /dev/null; then
        if ! command -v curl &> /dev/null; then
            $SUDO dnf install -y curl
        fi
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO dnf install -y nodejs git gcc-c++ make python3-devel
    elif command -v yum &> /dev/null; then
        if ! command -v curl &> /dev/null; then
            $SUDO yum install -y curl
        fi
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO yum install -y nodejs git gcc-c++ make python3-devel
    elif command -v pacman &> /dev/null; then
        $SUDO pacman -Sy --noconfirm nodejs npm git curl base-devel python
    else
        echo "Could not detect package manager. Please install Node.js >= 18 and Git manually."
        exit 1
    fi
}

if ! command -v git &> /dev/null || ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    install_deps
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

echo "Installing build tools (required for native modules)..."
if command -v apt-get &> /dev/null; then
    $SUDO apt-get install -y build-essential python3-dev
elif command -v dnf &> /dev/null; then
    $SUDO dnf install -y gcc-c++ make python3-devel
elif command -v yum &> /dev/null; then
    $SUDO yum install -y gcc-c++ make python3-devel
elif command -v pacman &> /dev/null; then
    $SUDO pacman -Sy --noconfirm base-devel python
fi

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
ExecStart=/bin/bash -lc 'node index.js'
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    $SUDO mv $SERVICE_FILE /etc/systemd/system/monikashell.service
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable monikashell
    $SUDO systemctl start monikashell
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
