#!/usr/bin/env node

/**
 * Comprehensive API test script for Cursor Usage Summary
 * Tests connectivity, authentication, and proxy support.
 */

const https = require('https');
const { URL } = require('url');

// Try to load https-proxy-agent if available
let HttpsProxyAgent;
try {
    HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) {
    // If not installed, proxy support will be limited to what Node.js can do (none natively)
}

const API_URL = 'https://cursor.com/api/usage-summary';

// Get configuration from command line
const token = process.argv[2];
const proxyUrl = process.argv[3] || process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;

if (!token) {
    console.log('\n🔍 Cursor Usage Summary - API Test Tool');
    console.log('=======================================');
    console.log('\nUsage: node test-api.js <YOUR_TOKEN> [PROXY_URL]');
    console.log('\nExample:');
    console.log('  node test-api.js "user_01XXX...::eyJhbGc..."');
    console.log('  node test-api.js "user_01XXX...::eyJhbGc..." "http://proxy:8080"');
    
    if (proxyUrl) {
        console.log('\nDetected proxy in environment:', proxyUrl);
    }
    process.exit(1);
}

function makeRequest(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        // Prepare cookie header
        const cookieHeader = token.startsWith('WorkosCursorSessionToken=') 
            ? token 
            : `WorkosCursorSessionToken=${token}`;

        const headers = {
            'User-Agent': 'Cursor-Usage-Summary-Extension/1.0.0',
            'Accept': 'application/json',
            'Cookie': cookieHeader
        };

        console.log(`\n[${5 - maxRedirects}] Requesting: ${url}`);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers,
            rejectUnauthorized: true,
            timeout: 15000
        };

        if (proxyUrl && HttpsProxyAgent) {
            options.agent = new HttpsProxyAgent(proxyUrl);
        }

        const req = https.request(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400) {
                const location = res.headers.location;
                console.log(`  ↪ Redirect (${res.statusCode}) to: ${location}`);

                res.resume();

                if (!location) {
                    reject(new Error('Redirect without location header'));
                    return;
                }

                if (maxRedirects <= 0) {
                    reject(new Error('Too many redirects - authentication likely failed'));
                    return;
                }

                const redirectUrl = location.startsWith('http') 
                    ? location 
                    : `https://cursor.com${location}`;

                makeRequest(redirectUrl, maxRedirects - 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
        req.end();
    });
}

console.log('🚀 Starting API Connectivity Test...');
console.log('-----------------------------------');
if (proxyUrl) console.log(`✓ Using proxy: ${proxyUrl}`);
else console.log('✓ Using direct connection');

makeRequest(API_URL)
    .then(data => {
        const parsed = JSON.parse(data);
        console.log('\n✅ Success! API response received.');
        console.log('\n--- Usage Summary ---');
        console.log(`Plan: ${parsed.membershipType} (${parsed.limitType})`);
        
        if (parsed.individualUsage?.overall) {
            const u = parsed.individualUsage.overall;
            console.log(`Individual: ${u.used.toLocaleString()} / ${u.limit.toLocaleString()} (${Math.round(u.used/u.limit*100)}%)`);
        }
        
        if (parsed.teamUsage?.pooled) {
            const p = parsed.teamUsage.pooled;
            console.log(`Team Pooled: ${p.used.toLocaleString()} / ${p.limit.toLocaleString()} (${Math.round(p.used/p.limit*100)}%)`);
        }
    })
    .catch(err => {
        console.error(`\n❌ Test Failed: ${err.message}`);
        if (err.message.includes('Redirect')) {
            console.log('\n💡 Hint: Your token is likely invalid or expired.');
        } else if (err.code === 'ECONNRESET' || err.message.includes('timeout')) {
            console.log('\n💡 Hint: Network issue. Check your proxy settings.');
        }
        process.exit(1);
    });
