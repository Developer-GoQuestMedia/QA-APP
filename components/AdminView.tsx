'use client'

import { useState } from 'react'
import { Project } from '@/types/project'
import Button from './Button'

interface AdminViewProps {
  initialProjects: Project[];
}

export default function AdminView({ initialProjects }: AdminViewProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Project Management</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <div
            key={project._id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow duration-200"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{project.title}</h2>
              <p className="text-gray-600 dark:text-gray-400">{project.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  Status: {project.status}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  Language: {project.sourceLanguage} → {project.targetLanguage}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

