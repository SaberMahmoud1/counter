const TelegramBot = require('node-telegram-bot-api'); // Import the Telegram Bot API library
const sqlite3 = require('sqlite3').verbose(); // Import SQLite3 library to manage databases
const express = require("express"); // Import Express.js for basic server setup
const fs = require('fs'); // Import the 'fs' module for file system operations (currently not used in the provided code)

// Use the TOKEN environment variable to securely access your bot's API token
const token = process.env.TOKEN;

// Initialize the Telegram bot with polling to fetch new updates from Telegram servers
const bot = new TelegramBot(token, { polling: true });

// Set up an Express server to keep the bot running (useful for deployment on platforms like Replit)
const app = express();
var listener = app.listen(process.env.PORT || 2000, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

// Simple endpoint to confirm the bot's server is running
app.get('/', (req, res) => {
  res.send(`
  <body>
  <center><h1>Bot 24H ON!</h1></center>
  </body>`);
});

/////////////////////////////////////////////////////////
// Object to manage connections for the counters database
const counterDBs = {};

// Function to initialize the counters database for a specific user (based on chat ID)
function initializeCounterDatabase(chatId) {
    if (!counterDBs[chatId]) {
        // Open or create a database specific to the user
        counterDBs[chatId] = new sqlite3.Database(`counters_${chatId}.db`, (err) => {
            if (err) {
                console.error('Error connecting to counters database:', err.message);
            } else {
                console.log('Connected to the counters database for chat ID:', chatId);
            }
        });

        // Create the 'counters' table if it doesn't already exist
        counterDBs[chatId].run(
            `CREATE TABLE IF NOT EXISTS counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )`,
            (err) => {
                if (err) {
                    console.error('Error creating counters table:', err.message);
                } else {
                    console.log('Counters table created or already exists for chat ID:', chatId);
                }
            }
        );
    }
}

// Object to keep track of the current state of each user's conversation
const userState = {};
// Command to create a new counter
bot.onText(/\/createcounter/, (msg) => {
    const chatId = msg.chat.id; // Extract the user's chat ID

    // Set the initial state for the user
    userState[chatId] = { step: 'waiting_for_name' };

    // Ask for the counter name
    bot.sendMessage(chatId, 'Please provide the name of the counter:');
});

// Handle user messages for creating counters
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    // Check if the user is in the process of creating a counter
    if (userState[chatId]) {
        const state = userState[chatId];

        if (state.step === 'waiting_for_name') {
            // Get the counter name from the user
            const counterName = msg.text;

            // Store the name and move to the next step
            state.name = counterName;
            state.step = 'waiting_for_value';

            // Ask for the initial value of the counter
            bot.sendMessage(chatId, 'Please provide the initial value of the counter:');
        } else if (state.step === 'waiting_for_value') {
            // Get the initial value from the user
            const initialValue = parseInt(msg.text, 10);

            // Validate the initial value
            if (isNaN(initialValue)) {
                bot.sendMessage(chatId, 'Invalid initial value. Please provide a valid number.');
                return;
            }

            // Initialize the counters database for the user if not done already
            if (!counterDBs[chatId]) {
                initializeCounterDatabase(chatId);
            }

            // Add the counter with the specified name and initial value to the user's database
            counterDBs[chatId].run(
                `INSERT INTO counters (name, count) VALUES (?, ?)`,
                [state.name, initialValue],
                (err) => {
                    if (err) {
                        console.error('Error creating counter:', err.message);
                        bot.sendMessage(chatId, 'An error occurred while creating the counter.');
                    } else {
                        bot.sendMessage(chatId, `Counter "${state.name}" with initial value "${initialValue}" has been created successfully.`);
                    }
                }
            );

            // Reset the user's state after the counter is created
            userState[chatId] = null;
        }
    }
});

// Command to list all counters
bot.onText(/\/listcounters/, (msg) => {
    const chatId = msg.chat.id; // Extract the user's chat ID

    // Initialize the counters database for the user
    initializeCounterDatabase(chatId);

    // Fetch all counters and their values from the user's database
    counterDBs[chatId].all(
        `SELECT name, count FROM counters`, // Query to select all counters with their values
        [],
        (err, rows) => {
            if (err) {
                console.error('Error fetching counters:', err.message);
                bot.sendMessage(chatId, 'An error occurred while fetching your counters.');
            } else if (rows.length === 0) {
                bot.sendMessage(chatId, 'You have no counters. Create one with /createcounter.');
            } else {
                // Format the counters list and send it as a message with some styling
                const countersList = rows
                    .map((row) => {
                        // Format each counter nicely with emoji and bold text for the name
                        return `🎯 *${row.name}*:\n   ➡️ *Value:* ${row.count}`;
                    })
                    .join('\n\n'); // Add spacing between each counter

                bot.sendMessage(chatId, `Here are your counters:\n\n${countersList}`, { parse_mode: 'Markdown' });
            }
        }
    );
});



/////////////////////////////////////////////////////////
// Bot is now ready to receive and handle commands
console.log("Bot is running and ready to handle commands!");
//////////////////////////////////////////////////////////////////
bot.onText(/\/counters/, (msg) => {
    const chatId = msg.chat.id; // Extract the user's chat ID

    // Initialize the counters database for the user
    initializeCounterDatabase(chatId);

    // Fetch all counters from the user's database
    counterDBs[chatId].all(
        `SELECT id, name, count FROM counters`, // Query to select all counters with their values
        [],
        (err, rows) => {
            if (err) {
                console.error('Error fetching counters:', err.message);
                bot.sendMessage(chatId, 'An error occurred while fetching your counters.');
            } else if (rows.length === 0) {
                bot.sendMessage(chatId, 'You have no counters. Create one with /createcounter.');
            } else {
                // Format the counters list to show both names and values
                const countersList = rows
                    .map((row, index) => `${index + 1}. ${row.name} - Value: ${row.count}`)
                    .join('\n');
                
                // Ask the user to choose a counter
                bot.sendMessage(chatId, `Here are your counters:\n${countersList}\n\nPlease choose a counter by typing its number.`);

                // Handle user selecting a counter
                bot.once('message', (selectMsg) => {
                    const selectedIndex = parseInt(selectMsg.text, 10) - 1;
                    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= rows.length) {
                        bot.sendMessage(chatId, 'Invalid selection. Please try again.');
                        return;
                    }

                    const selectedCounter = rows[selectedIndex];
                    bot.sendMessage(chatId, `You selected: ${selectedCounter.name} - Value: ${selectedCounter.count}\nWhat would you like to do next?choose using the table that is in the text bar -> ⌘`, {
                        reply_markup: {
                            keyboard: [
                                ['Increment', 'Decrement'],
                                ['Change Value'],
                                ['Delete Counter'], // New option to delete the counter
                                ['Cancel']
                            ],
                            one_time_keyboard: true,
                            resize_keyboard: true
                        }
                    });

                    // Handle the user's action on the selected counter
                    bot.once('message', (actionMsg) => {
                        const action = actionMsg.text;

                        if (action === 'Increment') {
                            counterDBs[chatId].run(
                                `UPDATE counters SET count = count + 1 WHERE id = ?`,
                                [selectedCounter.id],
                                (err) => {
                                    if (err) {
                                        bot.sendMessage(chatId, 'An error occurred while incrementing the counter.');
                                    } else {
                                        bot.sendMessage(chatId, `The counter "${selectedCounter.name}" has been incremented by 1. New value: ${selectedCounter.count + 1}`);
                                    }
                                }
                            );
                        } else if (action === 'Decrement') {
                            counterDBs[chatId].run(
                                `UPDATE counters SET count = count - 1 WHERE id = ?`,
                                [selectedCounter.id],
                                (err) => {
                                    if (err) {
                                        bot.sendMessage(chatId, 'An error occurred while decrementing the counter.');
                                    } else {
                                        bot.sendMessage(chatId, `The counter "${selectedCounter.name}" has been decremented by 1. New value: ${selectedCounter.count - 1}`);
                                    }
                                }
                            );
                        } else if (action === 'Change Value') {
                            bot.sendMessage(chatId, `Please provide the new value for "${selectedCounter.name}":`);

                            bot.once('message', (newValueMsg) => {
                                const newValue = parseInt(newValueMsg.text, 10);
                                if (isNaN(newValue)) {
                                    bot.sendMessage(chatId, 'Invalid value. Please provide a valid number.');
                                    return;
                                }

                                counterDBs[chatId].run(
                                    `UPDATE counters SET count = ? WHERE id = ?`,
                                    [newValue, selectedCounter.id],
                                    (err) => {
                                        if (err) {
                                            bot.sendMessage(chatId, 'An error occurred while changing the counter value.');
                                        } else {
                                            bot.sendMessage(chatId, `The counter "${selectedCounter.name}" has been updated to ${newValue}.`);
                                        }
                                    }
                                );
                            });
                        } else if (action === 'Delete Counter') {
                            // Confirm deletion
                            bot.sendMessage(chatId, `Are you sure you want to delete the counter "${selectedCounter.name}"? This action cannot be undone. Type "Yes" to confirm or "No" to cancel.`);

                            bot.once('message', (confirmMsg) => {
                                const confirmation = confirmMsg.text.toLowerCase();
                                if (confirmation === 'yes') {
                                    counterDBs[chatId].run(
                                        `DELETE FROM counters WHERE id = ?`,
                                        [selectedCounter.id],
                                        (err) => {
                                            if (err) {
                                                bot.sendMessage(chatId, 'An error occurred while deleting the counter.');
                                            } else {
                                                bot.sendMessage(chatId, `The counter "${selectedCounter.name}" has been deleted.`);
                                            }
                                        }
                                    );
                                } else {
                                    bot.sendMessage(chatId, 'Counter deletion cancelled.');
                                }
                            });
                        } else if (action === 'Cancel') {
                            bot.sendMessage(chatId, 'Action cancelled.');
                        }
                    });
                });
            }
        }
    );
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Send a welcome message and show available commands
    const welcomeMessage = `Hello, ${msg.chat.first_name}! Welcome to your personal counter bot. 🙌

Here are some commands you can use:
- /createcounter: Create a new counter.
- /listcounters: View all your counters.
- /counters: Manage your counters (Increment, Decrement, Change Value).

Start by creating a new counter with /createcounter or check your existing counters with /listcounters.`;

    bot.sendMessage(chatId, welcomeMessage);
});

