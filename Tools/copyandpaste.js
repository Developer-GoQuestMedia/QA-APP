import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ignore from 'ignore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .gitignore and create ignore filter
const gitignorePath = join(process.cwd(), '.gitignore');
const ig = ignore();
// Always ignore .git directory and README.md
ig.add(['.git/**', ".__tests__/**", 'README.md', 'package-lock.json', 'notes/**', '.cursorignore', '.cursorrules']);
try {
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
} catch (err) {
    console.warn('No .gitignore file found, proceeding without ignore rules');
}

// Remove IGNORED_DIRS constant since we'll use .gitignore rules instead
const MAX_FILE_SIZE = 10240 * 1024; // 10MB limit per file

function getAllFiles(dirPath, arrayOfFiles = [], indent = '') {
    const files = readdirSync(dirPath);
    let content = '';

    for (const file of files) {
        const fullPath = join(dirPath, file);
        const relativePath = relative(process.cwd(), fullPath);
        
        // Skip files/directories that match .gitignore rules
        if (ig.ignores(relativePath)) {
            continue;
        }

        const stats = statSync(fullPath);
        
        if (stats.isDirectory()) {
            // Skip if any parent directory is .git
            if (fullPath.includes('/.git/') || fullPath.includes('\\.git\\')) {
                continue;
            }
            content += `${indent}📁 ${file}/\n`;
            // Recursively get contents of subdirectories
            const { fileList, fileContent } = getAllFiles(fullPath, arrayOfFiles, indent + '  ');
            content += fileContent;
            arrayOfFiles = fileList;
        } else {
            // Skip if file is in .git directory
            if (fullPath.includes('/.git/') || fullPath.includes('\\.git\\')) {
                continue;
            }
            // Add file name to structure
            content += `${indent}📄 ${file}`;
            
            // Skip large files
            if (stats.size > MAX_FILE_SIZE) {
                content += ` (file too large - ${(stats.size / 10240 / 1024).toFixed(2)}MB)\n`;
                continue;
            }

            // Skip binary files or files with specific extensions
            const ext = file.toLowerCase().split('.').pop();
            if (['jpg', 'jpeg', 'png', 'gif', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'zip', 'pdf'].includes(ext)) {
                content += ' (binary file - skipped)\n';
                continue;
            }

            content += '\n';
            
            // Add file contents
            try {
                const fileContent = readFileSync(fullPath, 'utf8');
                arrayOfFiles.push({
                    path: relativePath,
                    content: fileContent
                });
            } catch (err) {
                console.error(`Error reading file ${fullPath}: ${err}`);
                content += `${indent}  (error reading file)\n`;
            }
        }
    }

    return { fileList: arrayOfFiles, fileContent: content };
}

function generateFileStructureAndContents() {
    const parentDir = resolve(__dirname, '..');
    const { fileList, fileContent } = getAllFiles(parentDir);
    
    let outputContent = '# Project Structure\n\n';
    outputContent += fileContent;
    outputContent += '\n\n# File Contents\n\n';

    fileList.forEach(file => {
        // Get file extension for proper code block formatting
        const ext = file.path.split('.').pop() || '';
        outputContent += `\n## File: ${file.path}\n\`\`\`${ext}\n${file.content}\n\`\`\`\n`;
    });

    // Write to output file
    const outputPath = join(__dirname, 'project_structure_and_contents.txt');
    writeFileSync(outputPath, outputContent);
    console.log(`File structure and contents have been saved to: ${outputPath}`);
}

// Execute the function
generateFileStructureAndContents();
