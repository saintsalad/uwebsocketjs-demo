import { App } from "uWebSockets.js";

const app = App();
let clients = new Map();
let nextUserId = 1;

// Initial boy position
let boy = { x: 100, y: 100, speed: 2, color: "blue", size: 20 };
let moveInterval = null;
let colorToggleInterval = null;
let sizeToggleInterval = null;

// Use PORT environment variable with fallback to 8080 for local development
const PORT = process.env.PORT || 8080;

function moveBoyRandomly() {
  boy.x += (Math.random() * 10 - 5) * boy.speed;
  boy.y += (Math.random() * 10 - 5) * boy.speed;

  // Keep within bounds
  boy.x = Math.max(50, Math.min(450, boy.x));
  boy.y = Math.max(50, Math.min(450, boy.y));

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
    action: "update_boy",
    x: boy.x,
    y: boy.y,
    color: boy.color,
    size: boy.size,
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

    // Send initial boy position WITH color AND size
    try {
      ws.send(
        JSON.stringify({
          action: "update_boy",
          x: boy.x,
          y: boy.y,
          color: boy.color,
          size: boy.size,
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
          boy.y -= 50;
          broadcastState();
        } else if (data.text === "run") {
          // Increase speed moderately but increase update frequency for smoothness
          boy.speed = 8;

          // Update position 10 times per second instead of once per second
          startMovementInterval(100);

          // Use array of colors instead of just red/green
          const colors = ["red", "green", "blue", "purple", "orange", "yellow"];
          let colorIndex = 0;
          boy.color = colors[0]; // Start with first color

          // Create interval to toggle colors
          if (colorToggleInterval) {
            clearInterval(colorToggleInterval);
          }

          // Create interval to toggle size
          if (sizeToggleInterval) {
            clearInterval(sizeToggleInterval);
          }

          // Change colors every 100ms, cycling through array
          colorToggleInterval = setInterval(() => {
            colorIndex = (colorIndex + 1) % colors.length;
            boy.color = colors[colorIndex];
            // Force broadcast with each color change to ensure size is also sent
            broadcastState();
          }, 100);

          // Toggle size between small and large
          let growingSize = true;
          boy.size = 20; // Reset size before starting
          sizeToggleInterval = setInterval(() => {
            // Make size changes more dramatic
            if (growingSize) {
              boy.size += 8;
              if (boy.size >= 60) growingSize = false;
            } else {
              boy.size -= 8;
              if (boy.size <= 10) growingSize = true;
            }
            // We're broadcasting from the color interval now
          }, 50);

          // Reset after 5 seconds
          setTimeout(() => {
            boy.speed = 2;
            startMovementInterval(1000);

            // Stop toggling and reset to defaults
            clearInterval(colorToggleInterval);
            clearInterval(sizeToggleInterval);
            colorToggleInterval = null;
            sizeToggleInterval = null;
            boy.color = "blue";
            boy.size = 20;
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
