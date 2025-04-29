FROM node:18-slim

WORKDIR /app

# Install build essentials and python for node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies - allow updating lockfile
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the application
COPY . .

# Build TypeScript
RUN pnpm run build

# Create directory for generated images
RUN mkdir -p generated_images

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3005
# Note: Other environment variables (PRIVY_APP_ID, PRIVY_APP_SECRET, etc.) should be set at runtime

# Expose the port
EXPOSE 3005

# Start the application
CMD ["node", "dist/index.js"] 