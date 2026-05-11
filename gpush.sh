#!/bin/bash

# Git commit and push script
# Usage: ./git-push.sh "Your commit message"

if [ -z "$1" ]; then
    echo "Error: Commit message required"
    echo "Usage: ./git-push.sh \"Your commit message\""
    exit 1
fi

COMMIT_MSG="$1"

echo "Adding all changes..."
git add .

echo "Committing with message: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "Pushing to origin main..."
git push origin main

echo "✓ Done!"
