import * as vscode from 'vscode';
import * as path from 'path';

interface ProjectItem {
    name: string;
    path: string;
    lastOpened?: number;
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectTreeItem | undefined | null | void> = new vscode.EventEmitter<ProjectTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
        if (element) {
            return [];
        }

        const config = vscode.workspace.getConfiguration('projectSelector');
        const projects = config.get('projects') as Array<ProjectItem> || [];

        // Sort projects by lastOpened (most recent first)
        const sortedProjects = [...projects].sort((a, b) => {
            const timeA = a.lastOpened || 0;
            const timeB = b.lastOpened || 0;
            return timeB - timeA;
        });

        return sortedProjects.map(project => new ProjectTreeItem(
            project.name,
            project.path,
            vscode.TreeItemCollapsibleState.None,
            project.lastOpened
        ));
    }
}

class ProjectTreeItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly projectPath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        private lastOpened?: number
    ) {
        super(name, collapsibleState);
        this.tooltip = `${this.projectPath}\n${this.getLastOpenedText()}`;
        this.description = this.projectPath;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'project';
    }

    private getLastOpenedText(): string {
        if (this.lastOpened) {
            const date = new Date(this.lastOpened);
            return `Zuletzt geöffnet: ${date.toLocaleString('de-DE')}`;
        }
        return 'Noch nie geöffnet';
    }
} 