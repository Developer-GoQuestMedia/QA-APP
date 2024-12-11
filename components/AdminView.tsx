'use client'

import { useState } from 'react'
import Card from './Card'
import Button from './Button'

interface Project {
  _id: string
  title: string
  description: string
  sourceLanguage: string
  targetLanguage: string
  status: string
  assignedTo: Array<{
    username: string
    role: string
  }>
}

export default function AdminView({ projects }: { projects: Project[] }) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  return (
    <div className="space-y-6">
      {/* Project Management Section */}
      <Card 
        title="Project Management" 
        headerAction={
          <Button variant="primary" size="sm">
            Add New Project
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Project List */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project._id}
                className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                onClick={() => setSelectedProject(project)}
              >
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold text-gray-900">{project.title}</h4>
                  <p className="text-sm text-gray-600">{project.description}</p>
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>{project.sourceLanguage} → {project.targetLanguage}</span>
                    <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                      {project.status}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Card>

      {/* User Management Section */}
      <Card title="User Management">
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="success" size="sm">
              Add New User
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Sample user row - replace with actual user data */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">John Doe</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                      Translator
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    3 Active
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Button variant="secondary" size="sm" className="mr-2">
                      Edit
                    </Button>
                    <Button variant="danger" size="sm">
                      Delete
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Settings Section */}
      <Card title="System Settings">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Source Language
              </label>
              <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                <option>English</option>
                <option>Spanish</option>
                <option>French</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Target Language
              </label>
              <select className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                <option>Spanish</option>
                <option>English</option>
                <option>French</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary">
              Save Settings
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

