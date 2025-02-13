import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectTreeProvider } from './ProjectTreeProvider';

interface ProjectItem {
    name: string;
    path: string;
    lastOpened?: number; // Timestamp when last opened
}

let globalProjectTreeProvider: ProjectTreeProvider;
let isUpdating = false;
let projectsCache: ProjectItem[] = [];

// Load projects from configuration
async function loadProjects(): Promise<ProjectItem[]> {
    const config = vscode.workspace.getConfiguration('projectSelector');
    return config.get('projects') as Array<ProjectItem> || [];
}

// Save projects to configuration
async function saveProjects(projects: ProjectItem[]) {
    if (isUpdating) {
        return;
    }
    isUpdating = true;
    
    try {
        projectsCache = projects;
        const config = vscode.workspace.getConfiguration('projectSelector');
        await config.update('projects', projects, vscode.ConfigurationTarget.Global);
        if (globalProjectTreeProvider) {
            globalProjectTreeProvider.refresh();
        }
    } finally {
        isUpdating = false;
    }
}

// Save projects when VSCode is about to close
function saveProjectsOnShutdown() {
    const config = vscode.workspace.getConfiguration('projectSelector');
    config.update('projects', projectsCache, vscode.ConfigurationTarget.Global);
}

// Helper function to update lastOpened timestamp for a project
async function updateLastOpenedTimestamp(projects: ProjectItem[], projectPath: string): Promise<ProjectItem[]> {
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    if (projectIndex !== -1) {
        const currentTime = Date.now();
        if (!projects[projectIndex].lastOpened || 
            (currentTime - projects[projectIndex].lastOpened) > 60000) {
            projects[projectIndex].lastOpened = currentTime;
            projectsCache = projects; // Update cache without saving
        }
    }
    return projects;
}

export async function activate(context: vscode.ExtensionContext) {
    // Load projects at startup
    projectsCache = await loadProjects();
    
    globalProjectTreeProvider = new ProjectTreeProvider(projectsCache);
    vscode.window.registerTreeDataProvider('projectList', globalProjectTreeProvider);

    // Register shutdown event
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('projectSelector')) {
                saveProjectsOnShutdown();
            }
        })
    );

    // Quick Search Command
    let searchProjectCommand = vscode.commands.registerCommand('projectList.searchProject', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.items = projectsCache.map(project => ({
            label: project.name,
            description: project.path,
            project: project
        }));
        
        quickPick.placeholder = 'Projektname eingeben (mindestens 2 Buchstaben)';
        quickPick.matchOnDescription = true;
        quickPick.onDidChangeValue(value => {
            if (value.length >= 2) {
                const searchValue = value.toLowerCase();
                quickPick.items = projectsCache
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
                const uri = vscode.Uri.file(selection.project.path);
                quickPick.dispose();
                
                // Update only the cache without saving to disk
                const projectIndex = projectsCache.findIndex(p => p.path === selection.project.path);
                if (projectIndex !== -1) {
                    projectsCache[projectIndex].lastOpened = Date.now();
                    globalProjectTreeProvider.refresh();
                }
                
                // Open without saving settings
                vscode.commands.executeCommand('vscode.openFolder', uri);
            }
        });

        quickPick.show();
    });

    // Initial workspace folders check
    const initialWorkspaceFolders = vscode.workspace.workspaceFolders || [];
    if (initialWorkspaceFolders.length > 0) {
        let hasChanges = false;

        for (const folder of initialWorkspaceFolders) {
            const folderPath = folder.uri.fsPath;
            const existingProject = projectsCache.find(p => p.path === folderPath);
            
            if (!existingProject) {
                const folderName = path.basename(folderPath);
                projectsCache.push({
                    name: folderName,
                    path: folderPath,
                    lastOpened: Date.now()
                });
                hasChanges = true;
            }
        }

        if (hasChanges) {
            globalProjectTreeProvider.refresh();
        }
    }

    // Automatically add opened folders
    let autoAddProject = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        if (isUpdating) {
            return;
        }

        let hasChanges = false;

        for (const folder of event.added) {
            const folderPath = folder.uri.fsPath;
            const existingProject = projectsCache.find(p => p.path === folderPath);
            
            if (!existingProject) {
                const folderName = path.basename(folderPath);
                projectsCache.push({
                    name: folderName,
                    path: folderPath,
                    lastOpened: Date.now()
                });
                hasChanges = true;
            }
        }

        if (hasChanges) {
            globalProjectTreeProvider.refresh();
        }
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

        // Create new project
        const newProject = {
            name: projectName,
            path: folderUri[0].fsPath,
            lastOpened: Date.now()
        };

        // Update cache
        projectsCache.push(newProject);
        
        // Update tree view
        globalProjectTreeProvider.updateProjects(projectsCache);

        // Save to configuration
        saveProjects(projectsCache);
    });

    // Open Project
    let openProjectCommand = vscode.commands.registerCommand('projectList.openProject', async (item: any) => {
        // Update only the cache without saving to disk
        const projectIndex = projectsCache.findIndex(p => p.path === item.projectPath);
        if (projectIndex !== -1) {
            projectsCache[projectIndex].lastOpened = Date.now();
            globalProjectTreeProvider.refresh();
        }

        const uri = vscode.Uri.file(path.resolve(item.projectPath));
        vscode.commands.executeCommand('vscode.openFolder', uri);
    });

    // Delete Project
    let deleteProjectCommand = vscode.commands.registerCommand('projectList.deleteProject', async (item: any) => {
        // Update cache first
        projectsCache = projectsCache.filter(p => p.name !== item.name);
        
        // Update tree view
        globalProjectTreeProvider.updateProjects(projectsCache);

        // Save to configuration
        saveProjects(projectsCache);
    });

    context.subscriptions.push(searchProjectCommand, autoAddProject, addProjectCommand, openProjectCommand, deleteProjectCommand);
}

export function deactivate() {
    // Save projects when extension is deactivated
    saveProjectsOnShutdown();
} 