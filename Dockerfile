# Stage 1: Compile and Build angular codebase

# Use official node image as the base image
FROM node:22@sha256:c601a46abb4d2ab80a9dc3da208d50d1122642d53f17a101926ace71e5a9bf1c AS build

# Set the working directory
WORKDIR /usr/local/app

# Install all the dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Add the source code to app
COPY ./ /usr/local/app/

# Generate the build of the application
RUN npm run build -- --configuration=production


# Stage 2: Serve app with nginx server

# Use official nginx image as the base image
FROM nginx:latest@sha256:06aa3d7be10bc6307990c81bdca075793132e9163391abc370c015e344e23128

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the build output to replace the default nginx contents.
COPY --from=build /usr/local/app/dist/IPEXCO/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
