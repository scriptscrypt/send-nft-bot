# Privy Wallet Integration

This document describes the integration of Privy server wallets into the Telegram bot application.

## Overview

The application now uses Privy's server wallet API to create and manage Solana wallets for users, replacing the previous approach that used a single private key. This provides several benefits:

1. Each user now has their own isolated wallet
2. Private keys are managed securely by Privy
3. Users can export their keys if needed
4. Support for server-initiated transactions

## Required Environment Variables

Add these to your environment or .env file:

```
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

## Features Implemented

### Wallet Creation and Management

Users can interact with their wallet through the `/wallet` command, which provides options to:
- Create a new wallet
- View their wallet address
- Export their private key (with security warnings)
- Enable or revoke server sessions

### Solana Agent Integration

The Solana agent has been updated to use Privy's server wallet instead of a direct private key. This allows:
- Each user to use their own wallet for blockchain operations
- Signing transactions on behalf of the user
- Secure transaction handling

### Telegram Bot Integration

The Telegram bot now includes commands for wallet management and provides a simple interface for users to:
- Create and manage their Solana wallet
- Securely export their private key
- Control server access to their wallet

## Technical Implementation

The integration includes:

1. A Privy client utility (`utils/privy.js`) for wallet operations
2. Updated Solana agent configuration to use Privy wallets
3. New Telegram bot commands for wallet management
4. Configuration updates to support Privy credentials

## Limitations

Some features like wallet delegation are simulated in the current implementation, as they would normally require frontend UI components from Privy. In a web-based application, these would use Privy's React components as described in their documentation.

## Security Notes

- Private key export is implemented with security measures (auto-deletion)
- Warning messages are shown before sensitive operations
- All user data is tied to the user's Telegram ID

## Next Steps

1. Implement a web-based component for proper wallet delegation
2. Add wallet funding functionality
3. Consider adding multi-chain support
4. Expand wallet features to include token management 