import minimist from 'minimist';
import express from 'express';
import fs from 'fs';

const ENDLINE = process.platform === 'win32' ? '\r\n' : '\n';

const argv = minimist(process.argv.slice(2));

const port = argv.p || 26000;
const authServerList = loadAuthServerList();

// Create proxy
const proxy = express();

// Handle JSON body
proxy.use(express.json());

// Debug
if (argv.debug) {
    proxy.use('*any', (req, res, next) => {
        console.log(req.originalUrl || req.url);
        next();
    });
}

// Proxy with offline fallback
proxy.get('*prefix/profile/:uuid', profile);
proxy.post('*prefix/join', join);

// Proxy to different auth servers
proxy.get('*prefix/hasJoined', authenticate);

// Serve meta
proxy.get('*server', getMeta);

// Start proxy
proxy.listen(port, () => {
    timeLog(`Proxy server running on port ${ port }`);

    if (argv.offline) {
        loadUserData();
    } else {
        timeLog(`Loaded ${ authServerList.length } auth server(s)`);
    }
});

/**
 * @param {Request} req 
 * @param {import('express').Response} res 
 */
function getMeta(req, res) {
    if (req.params.server.includes('server')) {
        timeLog(`Minecraft server (${ getConnectedAddr(req) }) connected`);
    }

    res.status(200).send({
        meta: {
            // serverName: 'Ely.by',
            // implementationName: 'Account Ely.by adapter for the authlib-injector library',
            // implementationVersion: '1.0.0',
            // 'feature.no_mojang_namespace': true,
            // 'feature.enable_profile_key': true,
            // links: {
            //     homepage: 'https://ely.by',
            //     register: 'https://account.ely.by/register'
            // }
        }
    });
}

/**
 * @param {import('express').Request} req
 */
function getConnectedAddr(req) {
    return req.ip.replace('::ffff:', '');
}

/**
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
async function profile(req, res) {
    const uuid = req.params.uuid;

    if (global.users) {
        for (const user of global.users) {
            if (user.id === uuid) return res.status(200).send(user);
        }
        
        return res.sendStatus(404);
    }

    const profileResponse = await fetch(req.url.replace('/sessionserver', 'https://sessionserver.mojang.com'));
    res.send(profileResponse);
}

/**
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
async function join(req, res) {
    if (global.users) {
        return res.status(200).setHeaders(new Map([['x-minecraft-request-id', 0]])).send();
    }

    const joinResponse = await fetch(req.url.replace('/sessionserver', 'https://sessionserver.mojang.com'), {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body)
    });

    res.send(joinResponse);
}

/**
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
async function authenticate(req, res) {
    const username = req.query.username;

    if (global.users) {
        for (const user of global.users) {
            if (user.name === username) {
                timeLog(`${username} authenticated with user data file`);
                return res.status(200).send(user);
            }
        }
    } else {
        for (const authServerUrl of authServerList) {
            const authResponse = await authFetch(authServerUrl, req);

            if (authResponse.status !== 200) continue;

            const authResponseBody = await getBody(authResponse);

            const authServerHostname = new URL(authServerUrl).hostname;
            timeLog(`${username} authenticated with ${authServerHostname}`);
            return res.status(200).setHeaders(authResponse.headers).send(authResponseBody);
        }
    }

    timeLog(`Failed to authenticate ${username}`);
    return res.sendStatus(404);
}

function loadAuthServerList() {
    const authServerFile = fs.readFileSync('./auth-server-list').toString();
    const authServerList = authServerFile.split(ENDLINE).filter(authServerUrl => authServerUrl.length > 0);
    return authServerList;
}

function loadUserData() {
    let userDataPath = argv.offline;
    if (userDataPath) {
        if (userDataPath === true) userDataPath = 'user-data.json';
        
        if (!fs.existsSync(userDataPath)) {
            timeLog(`Couldn't load user data file: ${userDataPath}`);
        } else {
            const usersText = fs.readFileSync(userDataPath, 'utf8');

            try {
                global.users = JSON.parse(usersText);
                timeLog(`Loaded ${global.users.length} user(s)`);
            } catch (error) {
                timeLog(error);
            }
        }
    }
}

/**
 * @param {string} url
 * @param {import('express').Request} req 
 */
async function authFetch(url, req) {
    const querySubstring = req.url.split('?')[1];

    return await fetch(url + '?' + querySubstring, {
        method: req.method,
        headers: req.headers
    });
}

/**
 * @param {Response} res 
 */
async function getBody(res) {
    // if (!res.headers.has('content-length')) return null;
    if (res.headers.get('content-type').includes('application/json')) return await res.json();
    return await res.text();
}

function timeLog(message, ...optionalParams) {
    console.log(`[${ new Date().toLocaleTimeString() }] `, message, ...optionalParams);
}
