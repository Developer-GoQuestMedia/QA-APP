import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Login from '@/app/login/page'

jest.mock('next-auth/react')
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

describe('Login Page', () => {
  const mockSignIn = signIn as jest.Mock
  const mockPush = jest.fn()

  beforeEach(() => {
    mockSignIn.mockClear()
    mockPush.mockClear()
    ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  })

  it('renders login form', () => {
    render(<Login />)
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('handles successful login', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    
    render(<Login />)
    
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testuser' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        username: 'testuser',
        password: 'password123',
        redirect: false,
      })
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('handles login error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    mockSignIn.mockResolvedValueOnce({ error: 'Invalid credentials' })
    
    render(<Login />)
    
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'wronguser' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid credentials')
      expect(mockPush).not.toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
  })
}) 