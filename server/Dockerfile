FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Expose backend port
EXPOSE 4000

# Start application
CMD ["npm", "start"]