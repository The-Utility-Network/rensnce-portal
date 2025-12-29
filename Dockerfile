# Stage 1: Build the app
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy the rest of your app's source code from your host to your image filesystem.
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Run the app
FROM node:18-alpine

WORKDIR /app

# Copy the build output from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose the port Next.js runs on
EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]