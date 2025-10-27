import minimist from 'minimist';
import express from 'express';
import fs from 'fs';

const ENDLINE = process.platform === 'win32' ? '\r\n' : '\n';

const argv = minimist(process.argv.slice(2));

const port = argv.p || 50000;

// Create proxy
const proxy = express();

// Handle JSON body
proxy.use(express.json());

// Redirect
proxy.get('/sessionserver/*suburl', authenticate);

// Serve meta
proxy.get('/', getMeta);

// Start proxy
proxy.listen(port, () => console.log(`[${ getTime() }] Proxy server running at http://localhost:${ port }`));

loadAuthServerList();

/**
 * @param {Request} req 
 * @param {import('express').Response} res 
 */
function getMeta(req, res) {
    console.log(`[${ getTime() }] Minecraft server connected`);

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
 * @param {import('express').Response} res 
 */
async function authenticate(req, res) {
    const username = req.query.username;

    const authServerList = loadAuthServerList();
    for (const authServerUrl of authServerList) {
        const authResponse = await authFetch(authServerUrl, req);

        if (authResponse.status !== 200) continue;

        const authResponseBody = await getBody(authResponse);

        const authServerHostname = new URL(authServerUrl).hostname;
        console.log(`[${ getTime() }] ${username} authenticated with ${authServerHostname}`);
        return res.status(200).setHeaders(authResponse.headers).send(authResponseBody);
    }

    console.log(`[${ getTime() }] Failed to authenticate ${username}`);
    return res.sendStatus(404);
}

function loadAuthServerList() {
    const authServerFile = fs.readFileSync('./auth-server-list').toString();
    const authServerList = authServerFile.split(ENDLINE);
    return authServerList;
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

function getTime() {
    return new Date().toLocaleTimeString();
}