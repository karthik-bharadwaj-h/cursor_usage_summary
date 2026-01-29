import * as https from 'https';
import * as http from 'http';
import * as vscode from 'vscode';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { URL } from 'url';

export interface UsageSummary {
    billingCycleStart: string;
    billingCycleEnd: string;
    membershipType: string;
    limitType: string;
    isUnlimited: boolean;
    autoModelSelectedDisplayMessage: string;
    namedModelSelectedDisplayMessage: string;
    individualUsage: {
        overall: {
            enabled: boolean;
            used: number;
            limit: number;
            remaining: number;
        };
    };
    teamUsage: {
        onDemand: {
            enabled: boolean;
            used: number;
            limit: number;
            remaining: number;
        };
        pooled: {
            enabled: boolean;
            used: number;
            limit: number;
            remaining: number;
        };
    };
}

export class UsageService {
    private cache: Map<string, { data: UsageSummary; timestamp: number }> = new Map();
    private readonly CACHE_DURATION = 60 * 1000; // 1 minute
    private readonly API_BASE_URL = 'https://cursor.com';
    private readonly API_ENDPOINT = '/api/usage-summary';

    constructor() {
        console.log('[UsageService] Initialized with native https module');
    }

    private getRequestOptions(): { agent?: any; headers: Record<string, string> } {
        const config = vscode.workspace.getConfiguration('cursorUsageSummary');
        const apiToken = config.get<string>('apiToken');
        let proxyUrl = config.get<string>('proxy');

        // If no proxy configured in settings, try environment variables
        if (!proxyUrl || !proxyUrl.trim()) {
            proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || 
                       process.env.http_proxy || process.env.HTTP_PROXY || '';
            
            if (proxyUrl) {
                console.log('[UsageService] Using proxy from environment variables:', proxyUrl);
            }
        }

        const headers: Record<string, string> = {
            'User-Agent': 'Cursor-Usage-Summary-Extension/1.0.0',
            'Accept': 'application/json'
        };

        // Handle cookie/token
        if (apiToken) {
            if (apiToken.startsWith('WorkosCursorSessionToken=')) {
                headers['Cookie'] = apiToken;
                console.log('[UsageService] Using full cookie format');
            } else {
                headers['Cookie'] = `WorkosCursorSessionToken=${apiToken}`;
                console.log('[UsageService] Constructed cookie from token value');
            }
        }

        let agent = undefined;
        if (proxyUrl && proxyUrl.trim()) {
            console.log(`[UsageService] Configuring proxy: ${proxyUrl}`);
            try {
                agent = new HttpsProxyAgent(proxyUrl);
                console.log('[UsageService] Proxy agent created successfully');
            } catch (error) {
                console.error('[UsageService] Failed to create proxy agent:', error);
                vscode.window.showErrorMessage(`Cursor Usage: Failed to configure proxy: ${error}`);
            }
        } else {
            console.log('[UsageService] No proxy configured, using direct connection');
            // Use a custom agent with simpler settings
            agent = new https.Agent({
                keepAlive: false,
                maxSockets: 1
            });
        }

        return { agent, headers };
    }

    private makeHttpsRequest(url: string, maxRedirects: number = 5): Promise<string> {
        return new Promise((resolve, reject) => {
            const { agent, headers } = this.getRequestOptions();
            const urlObj = new URL(url);

            console.log('[UsageService] Making request to:', url);
            console.log('[UsageService] Headers:', Object.keys(headers));

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: headers,
                agent: agent,
                rejectUnauthorized: true,
                // Add explicit timeout at socket level
                timeout: 30000
            };

            const req = https.request(options, (res) => {
                console.log('[UsageService] Response status:', res.statusCode);
                console.log('[UsageService] Response headers:', Object.keys(res.headers));

                // Handle redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
                    const location = res.headers.location;
                    console.log('[UsageService] Redirect to:', location);

                    // Consume the response body to free up the connection
                    res.resume();

                    if (!location) {
                        reject(new Error('Redirect without location header'));
                        return;
                    }

                    if (maxRedirects <= 0) {
                        reject(new Error('Too many redirects - authentication likely failed'));
                        return;
                    }

                    // Resolve relative redirects
                    const redirectUrl = location.startsWith('http') 
                        ? location 
                        : `${this.API_BASE_URL}${location}`;

                    console.log('[UsageService] Following redirect to:', redirectUrl);
                    
                    // Follow redirect
                    this.makeHttpsRequest(redirectUrl, maxRedirects - 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                // Handle non-200 responses
                if (res.statusCode !== 200) {
                    // Consume response body
                    res.resume();
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                // Collect response data
                let data = '';
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    data += chunk;
                    console.log('[UsageService] Received chunk, size:', chunk.length);
                });

                res.on('end', () => {
                    console.log('[UsageService] Response completed, total length:', data.length);
                    resolve(data);
                });

                res.on('error', (error) => {
                    console.error('[UsageService] Response stream error:', error);
                    reject(error);
                });
            });

            req.on('error', (error) => {
                console.error('[UsageService] Request error:', error);
                reject(error);
            });

            req.on('timeout', () => {
                console.error('[UsageService] Request timeout after 30 seconds');
                req.destroy();
                reject(new Error('Request timeout - connection took too long'));
            });

            req.on('socket', (socket) => {
                console.log('[UsageService] Socket assigned');
                
                socket.on('connect', () => {
                    console.log('[UsageService] Socket connected');
                });
                
                socket.on('secureConnect', () => {
                    console.log('[UsageService] TLS handshake completed');
                });

                socket.on('timeout', () => {
                    console.error('[UsageService] Socket timeout');
                    req.destroy();
                });
            });

            req.end();
        });
    }

    async getUsageSummary(forceRefresh: boolean = false): Promise<UsageSummary> {
        const cacheKey = 'usage-summary';
        const cached = this.cache.get(cacheKey);
        
        // Return cached data if it's still valid and not forced
        if (!forceRefresh && cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            console.log('[UsageService] Returning cached usage data');
            return cached.data;
        }

        // Check authentication token first
        const apiConfig = vscode.workspace.getConfiguration('cursorUsageSummary');
        const apiToken = apiConfig.get<string>('apiToken');
        const proxyUrl = apiConfig.get<string>('proxy');
        
        console.log('[UsageService] Configuration check:');
        console.log('- API Token configured:', !!apiToken);
        console.log('- API Token length:', apiToken?.length || 0);
        console.log('- Proxy configured:', !!proxyUrl);
        console.log('- Proxy URL:', proxyUrl || 'None');
        
        if (!apiToken) {
            console.warn('[UsageService] No API token configured, returning mock data');
            vscode.window.showWarningMessage('Cursor Usage: No API token configured. Using mock data.');
            return this.getMockUsageData();
        }

        console.log('[UsageService] Starting API request to /api/usage-summary');
        console.log('[UsageService] Request configuration:');
        console.log('  - Full URL:', `${this.API_BASE_URL}${this.API_ENDPOINT}`);

        try {
            const responseData = await this.makeHttpsRequest(`${this.API_BASE_URL}${this.API_ENDPOINT}`);
            
            console.log('[UsageService] Response received successfully');
            
            // Parse JSON response
            let parsedData: UsageSummary;
            try {
                parsedData = JSON.parse(responseData);
            } catch (parseError) {
                console.error('[UsageService] Failed to parse JSON response:', parseError);
                console.error('[UsageService] Response data preview:', responseData.substring(0, 200));
                throw new Error('Invalid JSON response from API');
            }
            
            console.log('[UsageService] Response data structure:', {
                hasBillingCycle: !!parsedData?.billingCycleStart,
                hasIndividualUsage: !!parsedData?.individualUsage,
                hasTeamUsage: !!parsedData?.teamUsage
            });
            
            // Verify we got actual data back
            if (!parsedData || !parsedData.individualUsage) {
                console.error('[UsageService] Invalid response structure:', parsedData);
                throw new Error('Invalid response structure from API');
            }
            
            // Cache the response
            this.cache.set(cacheKey, {
                data: parsedData,
                timestamp: Date.now()
            });

            console.log('[UsageService] Successfully fetched and cached usage data from API');
            return parsedData;
        } catch (error) {
            console.error('[UsageService] API request failed:', error);
            
            let errorMessage = 'Failed to fetch usage data from Cursor API: ';
            
            if (error instanceof Error) {
                if (error.message.includes('Too many redirects')) {
                    errorMessage += 'Redirect loop detected. Your API token may be invalid or expired.';
                } else if (error.message.includes('ECONNREFUSED')) {
                    errorMessage += 'Connection refused. Check if proxy is accessible.';
                } else if (error.message.includes('ENOTFOUND')) {
                    errorMessage += 'DNS resolution failed. Check network connectivity.';
                } else if (error.message.includes('timeout')) {
                    errorMessage += 'Request timed out. Check network connectivity and proxy settings.';
                } else if (error.message.includes('401')) {
                    errorMessage += 'Invalid or expired authentication token.';
                } else if (error.message.includes('403')) {
                    errorMessage += 'Access denied. The API token may not have the required permissions.';
                } else if (error.message.includes('404')) {
                    errorMessage += 'API endpoint not found.';
                } else {
                    errorMessage += error.message;
                }
                
                vscode.window.showErrorMessage(`Cursor Usage: ${errorMessage}`);
            } else {
                vscode.window.showErrorMessage(`Cursor Usage: Network error - ${String(error)}`);
            }
            
            // On error, return cached data if available, otherwise fall back to mock data
            if (cached) {
                console.warn('[UsageService] Returning cached data due to API error');
                vscode.window.showWarningMessage('Cursor Usage: Using cached data due to API error');
                return cached.data;
            }
            
            console.warn('[UsageService] No cached data available, using mock data as fallback');
            vscode.window.showWarningMessage('Cursor Usage: Using demo data');
            return this.getMockUsageData();
        }
    }

    private getMockUsageData(): UsageSummary {
        return {
            billingCycleStart: "2026-01-01T00:00:00.000Z",
            billingCycleEnd: "2026-02-01T00:00:00.000Z",
            membershipType: "enterprise",
            limitType: "team",
            isUnlimited: false,
            autoModelSelectedDisplayMessage: "You've used 0% of your included total usage",
            namedModelSelectedDisplayMessage: "You've used 0% of your included API usage",
            individualUsage: {
                overall: {
                    enabled: true,
                    used: 794,
                    limit: 5000,
                    remaining: 4206
                }
            },
            teamUsage: {
                onDemand: {
                    enabled: true,
                    used: 0,
                    limit: 15000000,
                    remaining: 15000000
                },
                pooled: {
                    enabled: true,
                    used: 6175916,
                    limit: 180000000,
                    remaining: 173824084
                }
            }
        };
    }

    getIndividualUsagePercentage(usageData: UsageSummary): number {
        if (!usageData.individualUsage?.overall) {
            return 0;
        }
        
        const { used, limit } = usageData.individualUsage.overall;
        return Math.round((used / limit) * 100);
    }

    getTeamUsageInfo(usageData: UsageSummary): { onDemand: { percentage: number; used: number; limit: number }, pooled: { percentage: number; used: number; limit: number } } {
        const teamUsage = usageData.teamUsage;
        
        return {
            onDemand: {
                percentage: teamUsage?.onDemand ? Math.round((teamUsage.onDemand.used / teamUsage.onDemand.limit) * 100) : 0,
                used: teamUsage?.onDemand?.used || 0,
                limit: teamUsage?.onDemand?.limit || 0
            },
            pooled: {
                percentage: teamUsage?.pooled ? Math.round((teamUsage.pooled.used / teamUsage.pooled.limit) * 100) : 0,
                used: teamUsage?.pooled?.used || 0,
                limit: teamUsage?.pooled?.limit || 0
            }
        };
    }

    clearCache(): void {
        this.cache.clear();
        console.log('[UsageService] Usage data cache cleared');
    }

    updateApiToken(): void {
        console.log('[UsageService] API token configuration changed, clearing cache');
        this.clearCache();
    }

    // Method to test connectivity
    async testConnectivity(): Promise<boolean> {
        try {
            console.log('[UsageService] Testing basic connectivity...');
            const responseData = await this.makeHttpsRequest(`${this.API_BASE_URL}${this.API_ENDPOINT}`);
            
            // Try to parse the response
            JSON.parse(responseData);
            
            console.log('[UsageService] Connectivity test successful');
            return true;
        } catch (error) {
            console.error('[UsageService] Connectivity test failed:', error);
            return false;
        }
    }
}
