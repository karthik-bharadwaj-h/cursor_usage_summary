import * as vscode from 'vscode';
import { UsageService } from './usageService';
import { StatusBarManager } from './statusBarManager';

let statusBarManager: StatusBarManager;
let usageService: UsageService;
let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Cursor Usage Summary extension is now active!');

    // Initialize services
    usageService = new UsageService();
    statusBarManager = new StatusBarManager(usageService);

    // Set up status bar
    statusBarManager.initialize();

    // Register command for showing detailed usage
    const showDetailsDisposable = vscode.commands.registerCommand('cursorUsageSummary.showUsageDetails', () => {
        showUsageDetails(context);
    });

    // Register command for testing connectivity
    const testConnectivityDisposable = vscode.commands.registerCommand('cursorUsageSummary.testConnectivity', async () => {
        vscode.window.showInformationMessage('Testing Cursor API connectivity...');
        const isConnected = await usageService.testConnectivity();
        if (isConnected) {
            vscode.window.showInformationMessage('✅ Cursor API connectivity test successful!');
        } else {
            vscode.window.showErrorMessage('❌ Cursor API connectivity test failed. Check the developer console for details.');
        }
    });

    // Register command for configuring API token
    const configureTokenDisposable = vscode.commands.registerCommand('cursorUsageSummary.configureToken', async () => {
        const config = vscode.workspace.getConfiguration('cursorUsageSummary');
        const currentToken = config.get<string>('apiToken');
        
        const result = await vscode.window.showInputBox({
            prompt: 'Enter your Cursor authentication token (WorkosCursorSessionToken)',
            value: currentToken || '',
            ignoreFocusOut: true,
            placeHolder: 'user_01XXX...::eyJhbG... or WorkosCursorSessionToken=user_01XXX...::eyJhbG...',
            password: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Token cannot be empty';
                }
                // Check if it's at least a reasonable length
                if (value.length < 50) {
                    return 'Token seems too short. Make sure you copied the entire value.';
                }
                // Check if it contains the expected format (user_ID::JWT or WorkosCursorSessionToken=user_ID::JWT)
                if (!value.includes('::') && !value.includes('user_')) {
                    return 'Token format looks incorrect. Should contain user_ID::JWT_TOKEN';
                }
                return undefined;
            }
        });
        
        if (result !== undefined) {
            await config.update('apiToken', result, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('API token configured! Reloading extension...');
            usageService.updateApiToken();
            statusBarManager.updateStatusBar().catch(console.error);
        }
    });

    context.subscriptions.push(showDetailsDisposable);
    context.subscriptions.push(testConnectivityDisposable);
    context.subscriptions.push(configureTokenDisposable);
    context.subscriptions.push(statusBarManager);

    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('cursorUsageSummary.statusBarAlignment') || 
            e.affectsConfiguration('cursorUsageSummary.statusBarPriority')) {
            statusBarManager.refreshSettings();
        }
        if (e.affectsConfiguration('cursorUsageSummary.compactMode')) {
            statusBarManager.updateStatusBar().catch(console.error);
        }
        if (e.affectsConfiguration('cursorUsageSummary.apiToken')) {
            usageService.updateApiToken();
            statusBarManager.updateStatusBar().catch(console.error);
        }
    }));

    // Start periodic updates
    startPeriodicUpdates();
}

function startPeriodicUpdates() {
    // Update every 1 minute
    const updateInterval = setInterval(async () => {
        try {
            await statusBarManager.updateStatusBar();
        } catch (error) {
            console.error('Failed to update usage data:', error);
        }
    }, 60 * 1000);

    // Update on startup
    statusBarManager.updateStatusBar().catch(console.error);
}

async function showUsageDetails(context: vscode.ExtensionContext) {
    try {
        // Force refresh to get latest values when user clicks
        const usageData = await usageService.getUsageSummary(true);
        
        // Also update the status bar immediately with these fresh values
        if (statusBarManager) {
            statusBarManager.updateStatusBar().catch(console.error);
        }
        
        // Create or reveal webview panel
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
        } else {
            currentPanel = vscode.window.createWebviewPanel(
                'cursorUsageSummary',
                'Cursor Usage Summary',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            currentPanel.onDidDispose(
                () => {
                    currentPanel = undefined;
                },
                null,
                context.subscriptions
            );
        }

        currentPanel.webview.html = getWebviewContent(usageData);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch usage data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function getWebviewContent(usageData: any): string {
    const individualUsage = usageData.individualUsage?.overall;
    const teamUsage = usageData.teamUsage;
    const billingCycle = {
        start: new Date(usageData.billingCycleStart).toLocaleDateString(),
        end: new Date(usageData.billingCycleEnd).toLocaleDateString()
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor Usage Summary</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        .header h1 {
            margin: 0;
            color: var(--vscode-textLink-foreground);
            font-size: 24px;
        }
        .header-icon {
            width: 32px;
            height: 32px;
        }
        .billing-info {
            background: var(--vscode-textBlockQuote-background);
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
            text-align: center;
        }
        .usage-section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-editor-foreground);
            margin-bottom: 10px;
            border-bottom: 2px solid var(--vscode-focusBorder);
            padding-bottom: 5px;
        }
        .usage-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
            background: var(--vscode-editor-selectionBackground);
        }
        .usage-label {
            font-weight: 500;
        }
        .usage-value {
            font-family: monospace;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background: var(--vscode-input-background);
            border-radius: 10px;
            overflow: hidden;
            margin: 5px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--vscode-charts-green) 0%, var(--vscode-charts-yellow) 70%, var(--vscode-charts-red) 100%);
            transition: width 0.3s ease;
            border-radius: 10px;
        }
        .percentage {
            text-align: right;
            font-weight: bold;
            margin-top: 2px;
        }
        .remaining {
            color: var(--vscode-charts-green);
            font-style: italic;
        }
        .team-section {
            display: grid;
            gap: 15px;
        }
        .status-message {
            text-align: center;
            padding: 10px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            font-style: italic;
            margin-top: 15px;
        }
        .icon {
            font-size: 1.2em;
            margin-right: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid var(--vscode-widget-border);
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <svg class="header-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="10" width="4" height="11" rx="1" fill="#4CAF50" />
                <rect x="10" y="5" width="4" height="16" rx="1" fill="#2196F3" />
                <rect x="17" y="13" width="4" height="8" rx="1" fill="#FFC107" />
            </svg>
            <h1>Cursor Usage Summary</h1>
        </div>
        
        <div class="billing-info">
            <strong>Billing Cycle:</strong> ${billingCycle.start} - ${billingCycle.end}<br>
            <strong>Plan Type:</strong> ${usageData.membershipType} (${usageData.limitType})
        </div>

        ${individualUsage ? `
        <div class="usage-section">
            <div class="section-title"><span class="icon">🧑‍💻</span>Individual Usage</div>
            <div class="usage-item">
                <div class="usage-label">Usage:</div>
                <div class="usage-value">${individualUsage.used.toLocaleString()} / ${individualUsage.limit.toLocaleString()}</div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.round((individualUsage.used / individualUsage.limit) * 100)}%"></div>
            </div>
            <div class="percentage">${Math.round((individualUsage.used / individualUsage.limit) * 100)}%</div>
            <div class="usage-item">
                <div class="usage-label">Remaining:</div>
                <div class="usage-value remaining">${individualUsage.remaining.toLocaleString()}</div>
            </div>
        </div>
        ` : ''}

        ${teamUsage ? `
        <div class="usage-section">
            <div class="section-title"><span class="icon">👥</span>Team Usage</div>
            
            ${teamUsage.onDemand && teamUsage.onDemand.used > 0 ? `
            <div class="team-section">
                <strong>On-Demand</strong>
                <div class="usage-item">
                    <div class="usage-label">Usage:</div>
                    <div class="usage-value">${teamUsage.onDemand.used.toLocaleString()} / ${teamUsage.onDemand.limit.toLocaleString()}</div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.round((teamUsage.onDemand.used / teamUsage.onDemand.limit) * 100)}%"></div>
                </div>
                <div class="percentage">${Math.round((teamUsage.onDemand.used / teamUsage.onDemand.limit) * 100)}%</div>
                <div class="usage-item">
                    <div class="usage-label">Remaining:</div>
                    <div class="usage-value remaining">${teamUsage.onDemand.remaining.toLocaleString()}</div>
                </div>
            </div>
            ` : ''}

            ${teamUsage.pooled && teamUsage.pooled.used > 0 ? `
            <div class="team-section">
                <strong>Pooled</strong>
                <div class="usage-item">
                    <div class="usage-label">Usage:</div>
                    <div class="usage-value">${teamUsage.pooled.used.toLocaleString()} / ${teamUsage.pooled.limit.toLocaleString()}</div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.round((teamUsage.pooled.used / teamUsage.pooled.limit) * 100)}%"></div>
                </div>
                <div class="percentage">${Math.round((teamUsage.pooled.used / teamUsage.pooled.limit) * 100)}%</div>
                <div class="usage-item">
                    <div class="usage-label">Remaining:</div>
                    <div class="usage-value remaining">${teamUsage.pooled.remaining.toLocaleString()}</div>
                </div>
            </div>
            ` : ''}
        </div>
        ` : ''}

        ${usageData.autoModelSelectedDisplayMessage || usageData.namedModelSelectedDisplayMessage ? `
        <div class="status-message">
            ${usageData.autoModelSelectedDisplayMessage ? `<div>Auto Model: ${usageData.autoModelSelectedDisplayMessage}</div>` : ''}
            ${usageData.namedModelSelectedDisplayMessage ? `<div>Named Model: ${usageData.namedModelSelectedDisplayMessage}</div>` : ''}
        </div>
        ` : ''}
        
        <div class="footer">
            Made with ❤️ by Karthik Halagur Bharadwaj for Cursor community
        </div>
    </div>
</body>
</html>
    `.trim();
}

export function deactivate() {
    if (statusBarManager) {
        statusBarManager.dispose();
    }
}
