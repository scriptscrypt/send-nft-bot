FROM node:18-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies - allow updating lockfile
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the application
COPY . .

# Create directory for generated images
RUN mkdir -p generated_images

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
# Note: Other environment variables (PRIVY_APP_ID, PRIVY_APP_SECRET, etc.) should be set at runtime

# Expose the port
EXPOSE 3001

# Start the application with ESM and JSON module compatibility
CMD ["node", "--experimental-json-modules", "--no-warnings", "index.js"] 