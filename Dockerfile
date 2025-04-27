FROM node:18-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies - allow updating lockfile
RUN pnpm install --no-frozen-lockfile

# Force node-fetch v2 for compatibility
RUN npm install node-fetch@2.7.0 --force

# Copy the rest of the application
COPY . .

# Create directory for generated images
RUN mkdir -p generated_images

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Start the application with ESM compatibility
CMD ["node", "--experimental-json-modules", "index.js"] 