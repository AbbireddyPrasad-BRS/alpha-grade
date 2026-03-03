import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const UserManagement = () => {
  const [users, setUsers] = useState({ faculty: [], students: [], admins: [] });
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching users', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const deleteUser = async (userId, role) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.delete(`/auth/users/${userId}?role=${role}`);
        fetchUsers();
      } catch (err) {
        alert('Error deleting user');
      }
    }
  };

  const openUserDetail = (user, role) => {
    setSelectedUser({ ...user, role });
    setEditForm({ ...user });
    setIsEditing(false);
  };

  const closeUserDetail = () => {
    setSelectedUser(null);
    setEditForm({});
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const saveUserChanges = async () => {
    try {
      await api.put(`/auth/users/${selectedUser._id}`, editForm);
      fetchUsers();
      closeUserDetail();
    } catch (err) {
      alert('Failed to update user details');
    }
  };

  if (loading) return <div className="p-4">Loading Users...</div>;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-xl font-bold mb-4">Faculty Control</h3>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.faculty.map(f => (
                <tr key={f._id}>
                  <td className="px-6 py-4 cursor-pointer text-indigo-600 hover:text-indigo-900 font-medium" onClick={() => openUserDetail(f, 'Faculty')}>{f.name} <span className="text-gray-500 font-normal">({f.email})</span></td>
                  <td className="px-6 py-4">{f.department}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => deleteUser(f._id, 'Faculty')} className="text-red-600 hover:text-red-900">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-xl font-bold mb-4">Student Management</h3>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrollment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.students.map(s => (
                <tr key={s._id}>
                  <td className="px-6 py-4 cursor-pointer text-indigo-600 hover:text-indigo-900 font-medium" onClick={() => openUserDetail(s, 'Student')}>{s.name}</td>
                  <td className="px-6 py-4">{s.enrollmentNumber}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => deleteUser(s._id, 'Student')} className="text-red-600 hover:text-red-900">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">User Details: {selectedUser.role}</h2>
              <button onClick={closeUserDetail} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input 
                    type="text" 
                    name="name"
                    value={isEditing ? editForm.name : selectedUser.name} 
                    disabled={!isEditing}
                    onChange={handleEditChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input 
                    type="email" 
                    name="email"
                    value={isEditing ? editForm.email : selectedUser.email} 
                    disabled={!isEditing}
                    onChange={handleEditChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                {selectedUser.role === 'Faculty' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Department</label>
                    <input 
                      type="text" 
                      name="department"
                      value={isEditing ? editForm.department : selectedUser.department} 
                      disabled={!isEditing}
                      onChange={handleEditChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                )}
                {selectedUser.role === 'Student' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Enrollment Number</label>
                    <input 
                      type="text" 
                      name="enrollmentNumber"
                      value={isEditing ? editForm.enrollmentNumber : selectedUser.enrollmentNumber} 
                      disabled={!isEditing}
                      onChange={handleEditChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                )}
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">Privileges & Permissions</h3>
                <div className="space-y-3">
                  {selectedUser.role === 'Faculty' && (
                    <>
                      <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <span className="text-sm font-medium text-gray-700">Ability to Create Exams</span>
                        <label className="switch">
                          <input 
                            type="checkbox" 
                            name="canCreateExam"
                            checked={isEditing ? editForm.canCreateExam : selectedUser.canCreateExam}
                            disabled={!isEditing}
                            onChange={handleEditChange}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <span className="text-sm font-medium text-gray-700">Ability to Evaluate Exams</span>
                        <label className="switch">
                          <input 
                            type="checkbox" 
                            name="canEvaluate"
                            checked={isEditing ? (editForm.canEvaluate !== undefined ? editForm.canEvaluate : true) : (selectedUser.canEvaluate !== undefined ? selectedUser.canEvaluate : true)}
                            disabled={!isEditing}
                            onChange={handleEditChange}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                        </label>
                      </div>
                    </>
                  )}
                  {selectedUser.role === 'Student' && (
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      <span className="text-sm font-medium text-gray-700">Ability to Write/Take Exams</span>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          name="canTakeExam"
                          checked={isEditing ? (editForm.canTakeExam !== undefined ? editForm.canTakeExam : true) : (selectedUser.canTakeExam !== undefined ? selectedUser.canTakeExam : true)}
                          disabled={!isEditing}
                          onChange={handleEditChange}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Edit Details
                </button>
              ) : (
                <>
                  <button 
                    onClick={() => { setIsEditing(false); setEditForm({...selectedUser}); }} 
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveUserChanges} 
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Save Changes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;