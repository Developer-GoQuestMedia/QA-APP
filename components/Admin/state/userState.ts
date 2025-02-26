import { User } from '@/types/user';

export interface UserState {
  isLoading: boolean;
  error: string | null;
  selectedUser: User | null;
  selectedUsernames: string[];
  isCreatingUser: boolean;
  isEditing: boolean;
  showUserDeleteConfirm: boolean;
  assignUserSearchTerm: string;
  filteredUsers: User[];
  modalFilteredUsers: User[];
}

export const initialUserState: UserState = {
  isLoading: false,
  error: null,
  selectedUser: null,
  selectedUsernames: [],
  isCreatingUser: false,
  isEditing: false,
  showUserDeleteConfirm: false,
  assignUserSearchTerm: '',
  filteredUsers: [],
  modalFilteredUsers: []
};

export const userStateActions = {
  updateUserState: (state: UserState, updates: Partial<User>): UserState => {
    if (!state.selectedUser?._id) return state;

    return {
      ...state,
      selectedUser: {
        ...state.selectedUser,
        ...updates,
        _id: state.selectedUser._id
      }
    };
  },

  setSelectedUser: (state: UserState, user: User | null): UserState => ({
    ...state,
    selectedUser: user,
    isEditing: false,
    showUserDeleteConfirm: false
  }),

  setAssignUserSearchTerm: (state: UserState, term: string): UserState => ({
    ...state,
    assignUserSearchTerm: term,
    modalFilteredUsers: state.filteredUsers.filter(user =>
      user.username.toLowerCase().includes(term.toLowerCase())
    )
  }),

  handleUserSelection: (state: UserState, username: string): UserState => ({
    ...state,
    selectedUsernames: state.selectedUsernames.includes(username)
      ? state.selectedUsernames.filter(u => u !== username)
      : [...state.selectedUsernames, username]
  }),

  setIsCreatingUser: (state: UserState, isCreatingUser: boolean): UserState => ({
    ...state,
    isCreatingUser
  }),

  setIsEditing: (state: UserState, isEditing: boolean): UserState => ({
    ...state,
    isEditing
  }),

  setShowUserDeleteConfirm: (state: UserState, showUserDeleteConfirm: boolean): UserState => ({
    ...state,
    showUserDeleteConfirm
  }),

  setFilteredUsers: (state: UserState, users: User[]): UserState => ({
    ...state,
    filteredUsers: users,
    modalFilteredUsers: users.filter(user =>
      user.username.toLowerCase().includes(state.assignUserSearchTerm.toLowerCase())
    )
  }),

  clearUserSelection: (state: UserState): UserState => ({
    ...state,
    selectedUser: null,
    isEditing: false,
    showUserDeleteConfirm: false
  }),

  clearUserSearchTerm: (state: UserState): UserState => ({
    ...state,
    assignUserSearchTerm: '',
    modalFilteredUsers: state.filteredUsers
  })
}; 