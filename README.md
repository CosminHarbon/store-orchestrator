# Speed Vendors

Multi-tenant e-commerce platform for managing online stores with custom templates, payments, and shipping integration.

## Getting Started

### Prerequisites

- Node.js & npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

### Installation

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd speed-vendors

# Install dependencies
npm i

# Start the development server
npm run dev
```

## Technologies

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase

## Mobile App (Capacitor)

This project uses Capacitor for native mobile builds.

```sh
# Build for Android
npm run build
npx cap sync android
npx cap open android

# Build for iOS
npm run build
npx cap sync ios
npx cap open ios
```

## Deployment

Build the project and deploy the `dist` folder to your preferred hosting provider.

```sh
npm run build
```
