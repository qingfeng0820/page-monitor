#!/bin/bash

# exit on error
set -e

# Load environment variables from .env file
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    # Export all variables from .env file
    set -a
    source .env
    set +a
else
    echo "Error: .env file not found!"
    echo "Please follow these steps:"
    echo "1. Create a .env file: touch .env"
    echo "2. Fill in the environment variables in .env file"
    echo "   Example: MONGO_DB_CONN_STR=mongodb://localhost:27017/"
    echo "3. Run deploy.sh again"
    exit 1
fi

# Parse command line arguments
DOCKER_IMAGE=${DOCKER_IMAGE:-"simple-track"}
CONTAINER_NAME=${CONTAINER_NAME:-"simple-track"}
PORT=${PORT:-8000}
SKIP_BUILD=false
DEV_MODE=false

while [ $# -gt 0 ]; do
    case $1 in
        --skip-build|-s)
            SKIP_BUILD=true
            shift
            ;;
        --image|-i)
            if [ $# -gt 1 ]; then
                DOCKER_IMAGE=$2
                shift
                shift
            else
                echo "Error: --image requires an argument"
                echo "Usage: $0 [--skip-build|-s] [--image|-i <docker-image>] [--dev] [--port|-p <port>]"
                exit 1
            fi
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --port|-p)
            if [ $# -gt 1 ]; then
                PORT=$2
                shift
                shift
            else
                echo "Error: --port requires an argument"
                echo "Usage: $0 [--skip-build|-s] [--image|-i <docker-image>] [--dev] [--port|-p <port>]"
                exit 1
            fi
            ;;
        *)
            echo "Unknown parameter: $1"
            echo "Usage: $0 [--skip-build|-s] [--image|-i <docker-image>] [--dev] [--port|-p <port>]"
            exit 1
            ;;
    esac
done

# Set default ENVIRONMENT if not already set
if [ -z "$ENVIRONMENT" ]; then
    if [ "$DEV_MODE" = true ]; then
        export ENVIRONMENT=development
        echo "Setting ENVIRONMENT to development (--dev mode)"
    else
        export ENVIRONMENT=production
        echo "Setting default ENVIRONMENT to production"
    fi
fi

# Run in development mode or production mode
if [ "$DEV_MODE" = true ]; then
    echo "Running in development mode on port $PORT..."
    echo "Starting application directly..."
    # Export environment variables
    if [ "$ENVIRONMENT" = "development" ]; then
        uvicorn app:app --host 0.0.0.0 --port $PORT --reload
    else
        uvicorn app:app --host 0.0.0.0 --port $PORT
    fi
else
    echo "Running in production mode..."
    
    # Build Docker image if not skipped
    if [ "$SKIP_BUILD" = false ]; then
        echo "Building Docker image..."
        docker build -t "$DOCKER_IMAGE" .
    else
        echo "Skipping Docker image build..."
    fi
    
    # Stop and remove existing container if it exists
    if docker ps -a | grep -q $CONTAINER_NAME; then
        echo "Removing existing container..."
        docker stop $CONTAINER_NAME
        docker rm $CONTAINER_NAME
    fi
    
    # Run Docker container with all environment variables
    echo "Starting Docker container on port $PORT..."
    docker run -d \
        --name $CONTAINER_NAME \
        -p $PORT:8000 \
        --env-file .env \
        "$DOCKER_IMAGE"
fi
