const request = require('request');
let functions = require('firebase-functions');
let admin = require('firebase-admin');

//Download your service-account file from Firebase -> Project Settings -> Service Accounts -> Firebase Admin SDK -> Generate Private Key
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://chatapp-3f829.firebaseio.com'
});

//used for facebook accountkit login with Firebase Custom Auth => Only works on Firebase Blaze plan
exports.getCustomToken = functions.https.onRequest((req, res) => {
    const accessToken = req.query.access_token || '';
    request({
        url: `https://graph.accountkit.com/v1.1/me/?access_token=${accessToken}`,
        json: true
    }, (error, fbResponse, data) => {
        if (error) {
            console.error('Access token validation request failed\n', error);
            res.status(400).send(error);
        } else if (data.error) {
            console.error(data.error);
            res.status(400).send(data);
        } else {
            admin.auth().createCustomToken(data.id)
                .then(customToken => res.status(200).send(customToken))
                .catch(error => {
                    console.error('Creating custom token failed:', error);
                    res.status(400).send(error);
                })
        }
    });
});


exports.newRequest = functions.database.ref('/requests/{userId}/friendRequests/').onWrite((snapshot, context) => {
    let requests = snapshot.after.val();
    //console.log(requests);
    if (requests != null) {
        let lastUserId = requests[requests.length - 1];
        return admin.database().ref('accounts/' + lastUserId).once('value', usersnap => {
            return sendMessage(context.params.userId, 'New Friend Request Received', usersnap.val().name + ' want to be your friend');
        });
    } else return false;
});

exports.friendRequestAccepted = functions.database.ref('accounts/{userId}/friends/').onWrite((snapshot, context) => {
    let friends = snapshot.after.val();
    //console.log(friends);
    if (friends != null) {
        let lastFriendId = friends[friends.length - 1];
        return admin.database().ref('accounts/' + lastFriendId).once('value', usersnap => {
            return sendMessage(context.params.userId, 'Friend Request Accepted', usersnap.val().name + ' accepted your request');
        });
    } else return false;
});

exports.newGroupCreation = functions.database.ref('accounts/{userId}/groups/{groupId}').onCreate((snapshot, context) => {
    return admin.database().ref('groups/' + context.params.groupId).once('value', snap => {
        return sendMessage(context.params.userId, 'New Group Chat', 'you have been added into ' + snap.val().name);
    });
});

exports.conversation = functions.database.ref('conversations/{conversationId}/messages/{message}').onCreate((snapshot, context) => {
    let message = snapshot.val();
    //console.log(message);
    if (message != null) {
        return admin.database().ref('conversations/' + context.params.conversationId + '/users').once('value', snap => {
            let users = snap.val();
            users.forEach(user => {
                if (message.sender != user) {
                    return admin.database().ref('accounts/' + user).once('value', usersnap => {
                        return sendMessage(user, usersnap.val().name, 'sent ' + message.type + ' message')
                    })
                }
            })
        })
    } else return false;

});

exports.groupConversation = functions.database.ref('groups/{groupId}/messages/{message}').onCreate((snapshot, context) => {
    var message = snapshot.val();
    //console.log(message);
    if(message != null){
        return admin.database().ref('groups/' + context.params.groupId).once('value', snap => {
            let groupname = snap.val().name
            let users = snap.val().members;
            users.forEach(user => {
                if (user != message.sender) {
                    return admin.database().ref('accounts/' + message.sender).once('value', usersnap => {
                        return sendMessage(user, groupname, usersnap.val().name + ' sent ' + message.type + ' message')
                    })
                }
            })
        });
    } else return false;
});

function sendMessage(uid, title, message) {
    return admin.database().ref('accounts/' + uid).once('value', snap => {
        var token = snap.val().pushToken;
        if (token === undefined || token === '' || token === null) {
            return true;
        }
        else {
            return admin.messaging().sendToDevice([token], {
                notification: {
                    title: title,
                    body: message,
                    sound: 'default'
                }
            }).then(data => {
                //console.log(data);
                return true;
            }).catch(err => {
                //console.log(err)
                return false;
            });
        }
    });
}