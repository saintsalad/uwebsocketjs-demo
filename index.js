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
