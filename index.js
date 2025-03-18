import { App } from "uWebSockets.js";

const app = App();
let clients = new Map();
let nextUserId = 1;

// Initial boy position
let boy = { x: 100, y: 100, speed: 2, color: "blue", size: 20 };
let boxes = [boy]; // Initialize with the original "boy"
let moveInterval = null;
let colorToggleInterval = null;
let sizeToggleInterval = null;

// Use PORT environment variable with fallback to 8080 for local development
const PORT = process.env.PORT || 8080;

function moveBoyRandomly() {
  // Update all boxes
  boxes.forEach((box) => {
    box.x += (Math.random() * 10 - 5) * box.speed;
    box.y += (Math.random() * 10 - 5) * box.speed;

    // Keep within bounds
    box.x = Math.max(50, Math.min(450, box.x));
    box.y = Math.max(50, Math.min(450, box.y));
  });

  broadcastState();
}

// Set initial movement interval
function startMovementInterval(intervalTime) {
  // Clear any existing interval first
  if (moveInterval) {
    clearInterval(moveInterval);
  }
  moveInterval = setInterval(moveBoyRandomly, intervalTime);
}

// Start with default 1-second interval
startMovementInterval(1000);

// Broadcast boy's position & chat to all clients
function broadcastState() {
  const data = JSON.stringify({
    action: "update_boxes",
    boxes: boxes,
  });
  clients.forEach((userId, client) => client.send(data));
}

function broadcastChat(message, senderId) {
  const data = JSON.stringify({
    action: "chat",
    text: message,
    userId: senderId,
  });
  clients.forEach((userId, client) => client.send(data));
}

// Add HTTP route for health checks (important for Fly.io)
app.get("/health", (res, req) => {
  console.log("Health check received");
  res.writeStatus("200 OK");
  res.writeHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", connections: clients.size }));
});

// Serve static HTML for the homepage
app.get("/", (res, req) => {
  res.writeStatus("200 OK");
  res.writeHeader("Content-Type", "text/html");
  res.end(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WebSocket Demo</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        </style>
      </head>
      <body>
        <h1>WebSocket Server Running</h1>
        <p>Connect to this server using a WebSocket client.</p>
        <p>Current active connections: ${clients.size}</p>
      </body>
    </html>
  `);
});

// Simplified WebSocket handler with minimal configuration
app.ws("/*", {
  // Set some basic options
  idleTimeout: 120,
  maxPayloadLength: 16 * 1024,

  // Open handler - simplified from the working minimal example
  open: (ws) => {
    const userId = nextUserId++;
    clients.set(ws, userId);

    // Send initial boxes state
    try {
      ws.send(
        JSON.stringify({
          action: "update_boxes",
          boxes: boxes,
        })
      );

      // Inform user of their ID
      ws.send(JSON.stringify({ action: "assigned_id", userId: userId }));
      console.log(`New viewer connected (ID: ${userId})`);
    } catch (error) {
      console.error(
        `Error during client initialization for User ${userId}:`,
        error
      );
    }
  },

  // Message handler with proper error handling
  message: (ws, message, isBinary) => {
    try {
      // Parse message safely
      let data;
      try {
        data = JSON.parse(Buffer.from(message).toString());
      } catch (parseError) {
        console.error(`Error parsing message: ${parseError.message}`);
        return;
      }

      const userId = clients.get(ws);
      console.log(`Received message from User ${userId}:`, data);

      if (data.action === "chat") {
        console.log(`Chat from User ${userId}: ${data.text}`);

        broadcastChat(`User ${userId}: ${data.text}`, userId);

        if (data.text === "jump") {
          boxes.forEach((box) => (box.y -= 50));
          broadcastState();
        } else if (data.text === "run") {
          // Reset to single box if we're not already in "run" mode
          if (boxes.length === 1 && !colorToggleInterval) {
            // Create 10 boxes (including the original)
            boxes = [boy]; // Start with original boy
            for (let i = 1; i < 10; i++) {
              boxes.push({
                x: 100 + (Math.random() * 200 - 100),
                y: 100 + (Math.random() * 200 - 100),
                speed: 2 + Math.random() * 4,
                color: "blue",
                size: 20,
              });
            }
          }

          // Set all boxes to high speed
          boxes.forEach((box) => (box.speed = 4 + Math.random() * 4));

          // Update position more frequently for smoothness
          startMovementInterval(100);

          // Array of colors
          const colors = [
            "red",
            "green",
            "blue",
            "purple",
            "orange",
            "yellow",
            "pink",
            "cyan",
            "magenta",
            "lime",
          ];

          // Clear any existing intervals
          if (colorToggleInterval) clearInterval(colorToggleInterval);
          if (sizeToggleInterval) clearInterval(sizeToggleInterval);

          // Randomly change colors and sizes
          colorToggleInterval = setInterval(() => {
            boxes.forEach((box) => {
              // Random color for each box
              box.color = colors[Math.floor(Math.random() * colors.length)];
              // Random size between 10 and 60
              box.size = 10 + Math.floor(Math.random() * 50);
            });
            broadcastState();
          }, 100);

          // Reset after 5 seconds
          setTimeout(() => {
            // Reset to a single box with default properties
            boxes = [{ x: 100, y: 100, speed: 2, color: "blue", size: 20 }];
            boy = boxes[0]; // Update boy reference to match the first box

            startMovementInterval(1000);

            // Stop toggling intervals
            clearInterval(colorToggleInterval);
            clearInterval(sizeToggleInterval);
            colorToggleInterval = null;
            sizeToggleInterval = null;

            broadcastState();
          }, 5000);

          broadcastState();
        } else if (data.text === "stress") {
          // EXTREME LATENCY TESTING
          console.log("Starting extreme latency test...");

          // Create 100 boxes for maximum stress
          boxes = [];
          for (let i = 0; i < 100; i++) {
            boxes.push({
              id: i,
              x: Math.random() * 400 + 50,
              y: Math.random() * 400 + 50,
              speed: Math.random() * 10 + 1,
              color: "blue",
              size: 20,
              rotation: 0,
              opacity: 1,
              shape: Math.random() > 0.5 ? "circle" : "square",
              pulseRate: Math.random() * 0.2,
              wobbleFrequency: Math.random() * 0.1,
              phase: Math.random() * Math.PI * 2,
            });
          }

          // Clear any existing intervals
          if (moveInterval) clearInterval(moveInterval);
          if (colorToggleInterval) clearInterval(colorToggleInterval);
          if (sizeToggleInterval) clearInterval(sizeToggleInterval);

          let frame = 0;

          // Create a single high-frequency interval that does everything
          // Running at ~60fps (16.67ms) for maximum stress
          const stressInterval = setInterval(() => {
            frame++;

            // For each box, apply ridiculous transformations
            boxes.forEach((box, i) => {
              // Chaotic movement patterns
              box.x += Math.sin(frame * 0.05 + i * 0.1) * box.speed;
              box.y += Math.cos(frame * 0.05 + i * 0.3) * box.speed;

              // Keep within bounds with bouncing behavior
              if (box.x < 50 || box.x > 450) box.speed *= -0.8;
              if (box.y < 50 || box.y > 450) box.speed *= -0.8;

              box.x = Math.max(0, Math.min(500, box.x));
              box.y = Math.max(0, Math.min(500, box.y));

              // Wild color changes - full RGB spectrum using HSL for smooth transitions
              const hue = (frame * 5 + i * 36) % 360;
              box.color = `hsl(${hue}, 100%, 50%)`;

              // Size pulsing
              box.size = 20 + 15 * Math.sin(frame * box.pulseRate + box.phase);

              // Rotation (client will need to implement this)
              box.rotation = (box.rotation + 5) % 360;

              // Opacity pulsing
              box.opacity = 0.5 + 0.5 * Math.sin(frame * 0.02 + i * 0.1);

              // Shape morphing if supported by client
              if (frame % 30 === 0) {
                box.shape = box.shape === "circle" ? "square" : "circle";
              }

              // Occasionally teleport boxes
              if (Math.random() < 0.01) {
                box.x = Math.random() * 400 + 50;
                box.y = Math.random() * 400 + 50;
              }

              // Occasionally duplicate or remove boxes to change array size
              if (Math.random() < 0.005 && boxes.length < 150) {
                boxes.push({
                  ...box,
                  id: boxes.length,
                  x: box.x + 20,
                  y: box.y + 20,
                });
              }

              if (Math.random() < 0.005 && boxes.length > 50) {
                boxes.splice(i, 1);
                return; // Skip the rest for removed box
              }
            });

            // Broadcast every frame for maximum network stress
            broadcastState();
          }, 16);

          // Add a timestamp to the broadcast data to measure latency
          const originalBroadcastState = broadcastState;
          broadcastState = function () {
            const data = JSON.stringify({
              action: "update_boxes",
              boxes: boxes,
              timestamp: Date.now(), // Client can use this to measure latency
              frame: frame,
            });
            clients.forEach((userId, client) => client.send(data));
          };

          // Reset after 10 seconds
          setTimeout(() => {
            console.log("Ending extreme latency test");
            clearInterval(stressInterval);

            // Restore original broadcast function
            broadcastState = originalBroadcastState;

            // Reset to a single box with default properties
            boxes = [{ x: 100, y: 100, speed: 2, color: "blue", size: 20 }];
            boy = boxes[0]; // Update boy reference to match the first box

            startMovementInterval(1000);
            colorToggleInterval = null;
            sizeToggleInterval = null;

            broadcastState();
          }, 10000);

          broadcastChat(
            "⚠️ Extreme latency test started. Will run for 10 seconds ⚠️",
            "SYSTEM"
          );
          broadcastState();
        }
      }
    } catch (error) {
      console.error(`General error in message handler:`, error);
    }
  },

  // Close handler
  close: (ws, code, message) => {
    const userId = clients.get(ws);
    clients.delete(ws);

    console.log(`WebSocket closed for User ${userId}:`);
    console.log(`- Close code: ${code}`);
    console.log(`- Close reason: ${message ? message.toString() : "None"}`);
    console.log(`Viewer disconnected (ID: ${userId})`);
  },
});

// Start the server on the specified port
app.listen(PORT, (listenSocket) => {
  if (listenSocket) {
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
  } else {
    console.log(`Failed to listen on port ${PORT}`);
    process.exit(1);
  }
});
