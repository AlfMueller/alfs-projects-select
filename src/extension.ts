import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectTreeProvider } from './ProjectTreeProvider';

interface ProjectItem {
    name: string;
    path: string;
    lastOpened?: number; // Timestamp when last opened
}

// Helper function to update lastOpened timestamp for a project
function updateLastOpenedTimestamp(projects: ProjectItem[], projectPath: string): ProjectItem[] {
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    if (projectIndex !== -1) {
        projects[projectIndex].lastOpened = Date.now();
    }
    return projects;
}

export function activate(context: vscode.ExtensionContext) {
    const projectTreeProvider = new ProjectTreeProvider();
    vscode.window.registerTreeDataProvider('projectList', projectTreeProvider);

    // Quick Search Command
    let searchProjectCommand = vscode.commands.registerCommand('projectList.searchProject', async () => {
        const config = vscode.workspace.getConfiguration('projectSelector');
        const projects = config.get('projects') as Array<ProjectItem> || [];

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = projects.map(project => ({
            label: project.name,
            description: project.path,
            project: project
        }));
        
        quickPick.placeholder = 'Projektname eingeben (mindestens 2 Buchstaben)';
        quickPick.matchOnDescription = true;
        quickPick.onDidChangeValue(value => {
            if (value.length >= 2) {
                const searchValue = value.toLowerCase();
                quickPick.items = projects
                    .filter(project => 
                        project.name.toLowerCase().includes(searchValue) || 
                        project.path.toLowerCase().includes(searchValue))
                    .map(project => ({
                        label: project.name,
                        description: project.path,
                        project: project
                    }));
            }
        });

        quickPick.onDidAccept(async () => {
            const selection = quickPick.selectedItems[0] as { label: string; description: string; project: ProjectItem };
            if (selection) {
                // Update lastOpened timestamp
                const projectIndex = projects.findIndex(p => p.path === selection.project.path);
                if (projectIndex !== -1) {
                    projects[projectIndex].lastOpened = Date.now();
                    await config.update('projects', projects, vscode.ConfigurationTarget.Global);
                }

                const uri = vscode.Uri.file(selection.project.path);
                quickPick.dispose();
                vscode.commands.executeCommand('vscode.openFolder', uri);
            }
        });

        quickPick.show();
    });

    // Initial workspace folders check
    const initialWorkspaceFolders = vscode.workspace.workspaceFolders || [];
    if (initialWorkspaceFolders.length > 0) {
        const config = vscode.workspace.getConfiguration('projectSelector');
        let projects = config.get('projects') as Array<ProjectItem> || [];

        for (const folder of initialWorkspaceFolders) {
            const folderPath = folder.uri.fsPath;
            const existingProject = projects.find(p => p.path === folderPath);
            
            if (!existingProject) {
                const folderName = path.basename(folderPath);
                projects.push({
                    name: folderName,
                    path: folderPath,
                    lastOpened: Date.now()
                });
            } else {
                // Update lastOpened for existing projects that are currently open
                projects = updateLastOpenedTimestamp(projects, folderPath);
            }
        }

        config.update('projects', projects, vscode.ConfigurationTarget.Global);
        projectTreeProvider.refresh();
    }

    // Automatically add opened folders
    let autoAddProject = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        const config = vscode.workspace.getConfiguration('projectSelector');
        let projects = config.get('projects') as Array<ProjectItem> || [];

        // Handle added folders
        for (const folder of event.added) {
            const folderPath = folder.uri.fsPath;
            const existingProject = projects.find(p => p.path === folderPath);
            
            if (!existingProject) {
                const folderName = path.basename(folderPath);
                projects.push({
                    name: folderName,
                    path: folderPath,
                    lastOpened: Date.now()
                });
            } else {
                // Update lastOpened for existing projects
                projects = updateLastOpenedTimestamp(projects, folderPath);
            }
        }

        await config.update('projects', projects, vscode.ConfigurationTarget.Global);
        projectTreeProvider.refresh();
    });

    // Add Project
    let addProjectCommand = vscode.commands.registerCommand('projectList.addProject', async () => {
        const projectName = await vscode.window.showInputBox({
            placeHolder: 'Enter project name',
            prompt: 'Enter a name for the project'
        });

        if (!projectName) return;

        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Project Folder'
        });

        if (!folderUri || folderUri.length === 0) return;

        const config = vscode.workspace.getConfiguration('projectSelector');
        const projects = config.get('projects') as Array<ProjectItem> || [];
        
        projects.push({
            name: projectName,
            path: folderUri[0].fsPath
        });

        await config.update('projects', projects, vscode.ConfigurationTarget.Global);
        projectTreeProvider.refresh();
    });

    // Open Project
    let openProjectCommand = vscode.commands.registerCommand('projectList.openProject', (item: any) => {
        const config = vscode.workspace.getConfiguration('projectSelector');
        const projects = config.get('projects') as Array<ProjectItem> || [];
        
        // Update lastOpened timestamp
        const projectIndex = projects.findIndex(p => p.name === item.name);
        if (projectIndex !== -1) {
            projects[projectIndex].lastOpened = Date.now();
            config.update('projects', projects, vscode.ConfigurationTarget.Global);
        }

        const uri = vscode.Uri.file(path.resolve(item.projectPath));
        vscode.commands.executeCommand('vscode.openFolder', uri);
    });

    // Delete Project
    let deleteProjectCommand = vscode.commands.registerCommand('projectList.deleteProject', async (item: any) => {
        const config = vscode.workspace.getConfiguration('projectSelector');
        const projects = config.get('projects') as Array<ProjectItem> || [];
        
        const newProjects = projects.filter(p => p.name !== item.name);
        await config.update('projects', newProjects, vscode.ConfigurationTarget.Global);
        projectTreeProvider.refresh();
    });

    context.subscriptions.push(searchProjectCommand, autoAddProject, addProjectCommand, openProjectCommand, deleteProjectCommand);
}

export function deactivate() {} 