#!/bin/bash
while true; do
  echo "Starting VLESS proxy..."
  node index.js
  echo "Server crashed, restarting in 3 seconds..."
  sleep 3
done
