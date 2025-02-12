import * as vscode from 'vscode';
import * as path from 'path';

export class ProjectManagerPanel {
    public static currentPanel: ProjectManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent();
        this._setWebviewMessageListener(this._panel.webview);
    }

    public static createOrShow() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ProjectManagerPanel.currentPanel) {
            ProjectManagerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'projectManager',
            'Projekt Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        ProjectManagerPanel.currentPanel = new ProjectManagerPanel(panel);
    }

    private async _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'addProject':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            title: 'Projektordner auswählen'
                        });

                        if (folderUri && folderUri.length > 0) {
                            const config = vscode.workspace.getConfiguration('projectSelector', null);
                            const projects = config.get('projects') as Array<{name: string, path: string}> || [];
                            
                            projects.push({
                                name: message.name,
                                path: folderUri[0].fsPath
                            });

                            await config.update('projects', projects, vscode.ConfigurationTarget.Global);
                            this._updateProjectList();
                        }
                        break;

                    case 'deleteProject':
                        const config = vscode.workspace.getConfiguration('projectSelector', null);
                        const projects = config.get('projects') as Array<{name: string, path: string}> || [];
                        const newProjects = projects.filter(p => p.name !== message.name);
                        await config.update('projects', newProjects, vscode.ConfigurationTarget.Global);
                        this._updateProjectList();
                        break;

                    case 'openProject':
                        const projectToOpen = message.path;
                        const uri = vscode.Uri.file(path.resolve(projectToOpen));
                        vscode.commands.executeCommand('vscode.openFolder', uri);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _updateProjectList() {
        const config = vscode.workspace.getConfiguration('projectSelector', null);
        const projects = config.get('projects') as Array<{name: string, path: string}> || [];
        this._panel.webview.postMessage({ command: 'updateProjects', projects });
    }

    private _getWebviewContent() {
        const config = vscode.workspace.getConfiguration('projectSelector', null);
        const projects = config.get('projects') as Array<{name: string, path: string}> || [];

        // Escape Funktion für Pfade und Namen
        const escapeString = (str: string) => {
            return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        };

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { padding: 20px; font-family: var(--vscode-font-family); }
                .project-form { margin-bottom: 20px; }
                input { 
                    padding: 5px;
                    margin: 5px 0;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                button {
                    padding: 5px 10px;
                    margin: 5px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                .project-item {
                    padding: 10px;
                    margin: 5px 0;
                    border: 1px solid var(--vscode-input-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .project-info {
                    flex-grow: 1;
                }
                .project-actions {
                    display: flex;
                    gap: 5px;
                }
            </style>
        </head>
        <body>
            <div class="project-form">
                <h3>Neues Projekt hinzufügen</h3>
                <input type="text" id="projectName" placeholder="Projektname">
                <button onclick="addProject()">Projekt hinzufügen</button>
            </div>

            <h3>Projekte</h3>
            <div id="projectList"></div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function addProject() {
                    const name = document.getElementById('projectName').value;
                    if (name) {
                        vscode.postMessage({
                            command: 'addProject',
                            name: name
                        });
                        document.getElementById('projectName').value = '';
                    }
                }

                function deleteProject(name) {
                    vscode.postMessage({
                        command: 'deleteProject',
                        name: name
                    });
                }

                function openProject(path) {
                    vscode.postMessage({
                        command: 'openProject',
                        path: path
                    });
                }

                function escapeHtml(unsafe) {
                    return unsafe
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
                }

                function updateProjectList(projects) {
                    const list = document.getElementById('projectList');
                    list.innerHTML = projects.map(project => {
                        const escapedName = escapeHtml(project.name);
                        const escapedPath = escapeHtml(project.path);
                        return \`
                            <div class="project-item">
                                <div class="project-info">
                                    <strong>\${escapedName}</strong><br>
                                    <small>\${escapedPath}</small>
                                </div>
                                <div class="project-actions">
                                    <button onclick="openProject('\${escapedPath}')" title="Projekt öffnen">Öffnen</button>
                                    <button onclick="deleteProject('\${escapedName}')" title="Projekt löschen">Löschen</button>
                                </div>
                            </div>
                        \`;
                    }).join('');
                }

                // Initial project list
                updateProjectList(${JSON.stringify(projects)});

                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateProjects':
                            updateProjectList(message.projects);
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }

    public dispose() {
        ProjectManagerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
} 