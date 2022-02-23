// For heroku port connectivity
require('dotenv').config()
require('./keepAlive')
const express = require('express')
const app = express()
const PORT = process.env.PORT || 8080;

// Discord
const discord = require('discord.js');
const client = new discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "GUILD_PRESENCES"]});

// Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASEAPI,
  authDomain: "tacosleep-a7d65.firebaseapp.com",
  projectId: "tacosleep-a7d65",
  storageBucket: "tacosleep-a7d65.appspot.com",
  messagingSenderId: "297911024425",
  appId: "1:297911024425:web:f3062032b0e4c363ff1538",
  measurementId: "G-S9SYQF1K8R"
};
const { getAuth, onAuthStateChanged } = require('firebase/auth');
const { getFirestore, doc, getDocs, setDoc, deleteDoc, updateDoc, query, collection, getDoc} = require('firebase/firestore');
const { initializeApp } = require('firebase/app');
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore();

// Other
const timerInterval = 60000; // Period of DB checks
const moment = require('moment'); // For time conversion
const alternativeMessages = require('./alternativeMessages');
const goodNightMessages = alternativeMessages.goodNightMessages;
const goToBedMessages = alternativeMessages.goToBedMessages;

/* Initalization */
// Open port 8080 (defined on heroku)
app.listen(PORT, () => {
    console.log(`App is running on port ${ PORT }`);
});

/* Event Handlers */
// Discord
client.on('ready', () =>{
    console.log('Bot is ready')
})

client.on('messageCreate', (message) =>{
    // Look for keywords here:
    if(message.content.startsWith('$sleep')){
        if(message.content.startsWith('set', 7)){
            let bedtime = message.content.slice(10);
            const docRef = doc(db, "BedTimes", message.member.id);
            getDoc(docRef).then(ref => {
                if(ref.exists()){
                    var data = ref.data();
                    data.time = bedtime;
                    data.guildID = message.guild.id;
                    data.chatID = message.channel.id;
                }
                else{
                    var data = { time: bedtime, guildID: message.guild.id, chatID: message.channel.id, streak: 0};
                }
                writeToDB("BedTimes", message.member.id, data);
                message.reply("Bedtime set!")
            });
        }
        else if(message.content.startsWith('remove', 7)){
            const opStatus = removeFromDB("BedTimes", message.member.id);
            if(opStatus){
                message.reply("Bedtime removed");
                return;
            }
            message.reply("Error, couldn't remove bedtime, please try again later");
        }
    }
})

client.login(process.env.TOKEN)

// Firebase
onAuthStateChanged(auth, user => {
    if(user != null){
        console.log('Logged In');
    }
    else{
        console.log('No User');
    }
})

// Repeating sleep check
setInterval(function() {
    const date = moment().utc();
    const dateEST = date.subtract(5, "hours");
    const dateNow = dateEST.format("HH:mm");
	const q = query(collection(db, "BedTimes"));
    readAllDocs(q).then(querySnapshot => {
        querySnapshot.forEach((doc) =>{
            if(doc.id == "Template"){
                return;
            }
            const data = doc.data();
            if(data.time.split(' ').join('') == dateNow){
                fetchMemberStatus(data.guildID, doc.id).then(status => {
                    let msg = "";
                    if(status == "online"){
                        data.streak = 'streak' in data ? Number(data.streak) -1 : -1; // If streak exists in data subtract 1 otherwise set to -1
                        msg = goToBedMessages[Math.floor(Math.random() * goToBedMessages.length)];
                    }
                    else{
                        data.streak = 'streak' in data ? Number(data.streak) + 1 : 1;
                        msg = goodNightMessages[Math.floor(Math.random() * goodNightMessages.length)];
                    }
                    client.channels.fetch(data.chatID).then(channel => {
                        channel.send("Hey <@" + doc.id + "> " + msg + " 🔥(" + data.streak.toString() + ")");
                    });
                    writeToDB("BedTimes", doc.id, data);
                })
            }
        })
    })
}, timerInterval);

/* Functions */
async function readAllDocs(query){
    try{
        var allDocs = await getDocs(query); // Tip: use var here since it's function defined
    }
    catch(e){
        console.error("Error!: ", e);
    }
    return allDocs;
}

async function writeToDB(collectionName, uniqueID, data){
    try{
        await setDoc(doc(db, collectionName, uniqueID), data);
    }
    catch(e){
        console.error("Error!: ", e);
    }
}

async function removeFromDB(collectionName, uniqueID){
    try{
        await deleteDoc(doc(db, collectionName, uniqueID));
        return true;
    }
    catch(e){
        console.error("Error! :", e);
        return false;
    }
}

async function fetchMemberStatus(guildID, userID){
    var server = await client.guilds.fetch(guildID);
    await server.members.fetch();
    var userPresence = server.presences.cache.get(userID);
    return userPresence.status;
}