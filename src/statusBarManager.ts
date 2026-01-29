import * as vscode from 'vscode';
import { UsageService, UsageSummary } from './usageService';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private updateInterval: NodeJS.Timeout | undefined;
    private readonly UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

    constructor(private usageService: UsageService) {
        this.statusBarItem = this.createStatusBarItem();
    }

    private createStatusBarItem(): vscode.StatusBarItem {
        const config = vscode.workspace.getConfiguration('cursorUsageSummary');
        const alignmentStr = config.get<string>('statusBarAlignment', 'Right');
        const priority = config.get<number>('statusBarPriority', 100);
        
        const alignment = alignmentStr === 'Left' 
            ? vscode.StatusBarAlignment.Left 
            : vscode.StatusBarAlignment.Right;

        const item = vscode.window.createStatusBarItem(alignment, priority);
        item.command = 'cursorUsageSummary.showUsageDetails';
        item.tooltip = 'Click to view detailed usage information';
        return item;
    }

    public refreshSettings(): void {
        const oldVisible = this.statusBarItem.hide !== undefined; // Check if it was showing
        this.statusBarItem.dispose();
        this.statusBarItem = this.createStatusBarItem();
        this.updateStatusBar().catch(console.error);
        this.statusBarItem.show();
    }

    initialize(): void {
        this.statusBarItem.show();
        this.startPeriodicUpdates();
    }

    private startPeriodicUpdates(): void {
        // Update immediately
        this.updateStatusBar().catch(console.error);

        // Set up periodic updates
        this.updateInterval = setInterval(async () => {
            await this.updateStatusBar();
        }, this.UPDATE_INTERVAL_MS);
    }

    async updateStatusBar(): Promise<void> {
        try {
            const usageData = await this.usageService.getUsageSummary();
            this.updateStatusBarDisplay(usageData);
        } catch (error) {
            console.error('Failed to update status bar:', error);
            this.setErrorState();
        }
    }

    private updateStatusBarDisplay(usageData: UsageSummary): void {
        const individualUsage = usageData.individualUsage?.overall;
        const config = vscode.workspace.getConfiguration('cursorUsageSummary');
        const isCompact = config.get<boolean>('compactMode', false);
        
        if (!individualUsage) {
            this.statusBarItem.text = isCompact ? '$(warning) N/A' : '$(warning) Usage: N/A';
            this.statusBarItem.backgroundColor = undefined;
            return;
        }

        const percentage = this.usageService.getIndividualUsagePercentage(usageData);
        const { remaining } = individualUsage;

        // Set text with appropriate icon based on usage level
        let icon = '$(check)';
        let backgroundColor = undefined;

        if (percentage >= 80) {
            icon = '$(error)';
            backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (percentage >= 60) {
            icon = '$(warning)';
        }

        if (isCompact) {
            this.statusBarItem.text = `${icon} ${percentage}%`;
        } else {
            this.statusBarItem.text = `${icon} Usage: ${percentage}% (${remaining.toLocaleString()} remaining)`;
        }
        
        this.statusBarItem.backgroundColor = backgroundColor;
        
        // Add color coding for the tooltip
        let tooltipMessage = `Individual Usage: ${individualUsage.used.toLocaleString()} / ${individualUsage.limit.toLocaleString()} (${percentage}%)`;
        
        const teamUsage = this.getTeamUsageInfo(usageData);
        if (teamUsage.onDemand.used > 0 || teamUsage.pooled.used > 0) {
            tooltipMessage += '\n\nTeam Usage:';
            if (teamUsage.onDemand.used > 0) {
                tooltipMessage += `\n• On-Demand: ${teamUsage.onDemand.used.toLocaleString()} / ${teamUsage.onDemand.limit.toLocaleString()} (${teamUsage.onDemand.percentage}%)`;
            }
            if (teamUsage.pooled.used > 0) {
                tooltipMessage += `\n• Pooled: ${teamUsage.pooled.used.toLocaleString()} / ${teamUsage.pooled.limit.toLocaleString()} (${teamUsage.pooled.percentage}%)`;
            }
        }
        
        tooltipMessage += '\n\nClick for detailed view';
        this.statusBarItem.tooltip = tooltipMessage;
    }

    private setErrorState(): void {
        const config = vscode.workspace.getConfiguration('cursorUsageSummary');
        const isCompact = config.get<boolean>('compactMode', false);
        this.statusBarItem.text = isCompact ? '$(error) Error' : '$(error) Usage: Error';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.tooltip = 'Error fetching usage data. Click to retry.';
    }

    private getTeamUsageInfo(usageData: UsageSummary): { onDemand: { percentage: number; used: number; limit: number }, pooled: { percentage: number; used: number; limit: number } } {
        return this.usageService.getTeamUsageInfo(usageData);
    }

    setVisible(visible: boolean): void {
        if (visible) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
        this.statusBarItem.dispose();
    }
}
