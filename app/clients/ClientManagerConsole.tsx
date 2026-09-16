"use client";

import { useState } from "react";
import { 
  Building, 
  Users, 
  Database, 
  Plus, 
  Trash2, 
  Settings2, 
  UserPlus, 
  X, 
  Check, 
  AlertTriangle,
  FileSpreadsheet,
  ShieldAlert,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import Link from "next/link";
import { 
  createClientAction, 
  deleteClientAction, 
  assignDrumsToClientAction, 
  createClientUserAction, 
  deleteClientUserAction 
} from "./actions";

interface AssignedDrum {
  id: number;
  name: string;
  description?: string | null;
  clientId?: number | null;
  status?: string | null;
}

interface AssignedUser {
  id: number;
  name?: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface ClientDetail {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  assignedDrums: AssignedDrum[];
  assignedUsers: AssignedUser[];
  inspectionsCount: number;
}

interface ClientManagerConsoleProps {
  isMaster: boolean;
  initialClients: ClientDetail[];
  allDrums: AssignedDrum[];
  currentClientUser?: ClientDetail | null;
}

export default function ClientManagerConsole({
  isMaster,
  initialClients,
  allDrums: initialAllDrums,
  currentClientUser
}: ClientManagerConsoleProps) {
  const [clientsList, setClientsList] = useState<ClientDetail[]>(initialClients);
  const [allDrumsList, setAllDrumsList] = useState<AssignedDrum[]>(initialAllDrums);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal States
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDesc, setNewClientDesc] = useState("");

  const [assigningClient, setAssigningClient] = useState<ClientDetail | null>(null);
  const [selectedDrumIds, setSelectedDrumIds] = useState<number[]>([]);

  const [userModalClient, setUserModalClient] = useState<ClientDetail | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const [deletingClient, setDeletingClient] = useState<ClientDetail | null>(null);

  const clearNotifications = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  // 1. Handle Create Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotifications();
    if (!newClientName.trim()) return;

    setLoading(true);
    try {
      const created = await createClientAction({
        name: newClientName,
        description: newClientDesc,
      });

      setClientsList((prev) => [
        ...prev,
        {
          ...created,
          assignedDrums: [],
          assignedUsers: [],
          inspectionsCount: 0,
        },
      ]);
      setSuccessMsg(`Client "${created.name}" created successfully.`);
      setShowCreateClientModal(false);
      setNewClientName("");
      setNewClientDesc("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create client.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Open Assign Drums Modal
  const openAssignDrumsModal = (client: ClientDetail) => {
    clearNotifications();
    setAssigningClient(client);
    setSelectedDrumIds(client.assignedDrums.map((d) => d.id));
  };

  // 3. Handle Save Drum Assignments
  const handleSaveDrumAssignments = async () => {
    if (!assigningClient) return;
    clearNotifications();
    setLoading(true);

    try {
      await assignDrumsToClientAction(assigningClient.id, selectedDrumIds);

      // Update local state reactively
      setClientsList((prev) =>
        prev.map((c) => {
          if (c.id === assigningClient.id) {
            const updatedDrums = allDrumsList.filter((d) => selectedDrumIds.includes(d.id));
            return { ...c, assignedDrums: updatedDrums };
          }
          return c;
        })
      );

      // Update allDrumsList clientId references
      setAllDrumsList((prev) =>
        prev.map((d) => {
          if (selectedDrumIds.includes(d.id)) {
            return { ...d, clientId: assigningClient.id };
          } else if (d.clientId === assigningClient.id) {
            return { ...d, clientId: null };
          }
          return d;
        })
      );

      setSuccessMsg(`Coke drum assignments updated for ${assigningClient.name}.`);
      setAssigningClient(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to assign drums.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Handle Create Client User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userModalClient) return;
    clearNotifications();
    setLoading(true);

    try {
      const createdUser = await createClientUserAction({
        clientId: userModalClient.id,
        email: newUserEmail,
        name: newUserName,
        password: newUserPassword,
      });

      setClientsList((prev) =>
        prev.map((c) => {
          if (c.id === userModalClient.id) {
            return {
              ...c,
              assignedUsers: [...c.assignedUsers, createdUser],
            };
          }
          return c;
        })
      );

      setSuccessMsg(`User "${createdUser.email}" added for ${userModalClient.name}.`);
      setUserModalClient(null);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  // 5. Handle Delete Client User
  const handleDeleteUser = async (clientId: number, userId: number) => {
    if (!confirm("Are you sure you want to delete this client user account?")) return;
    clearNotifications();
    setLoading(true);

    try {
      await deleteClientUserAction(userId);
      setClientsList((prev) =>
        prev.map((c) => {
          if (c.id === clientId) {
            return {
              ...c,
              assignedUsers: c.assignedUsers.filter((u) => u.id !== userId),
            };
          }
          return c;
        })
      );
      setSuccessMsg("Client user account deleted.");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete user.");
    } finally {
      setLoading(false);
    }
  };

  // 6. Handle Delete Client
  const handleDeleteClientConfirm = async () => {
    if (!deletingClient) return;
    clearNotifications();
    setLoading(true);

    try {
      await deleteClientAction(deletingClient.id);
      setClientsList((prev) => prev.filter((c) => c.id !== deletingClient.id));
      setSuccessMsg(`Client organization "${deletingClient.name}" deleted.`);
      setDeletingClient(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete client.");
    } finally {
      setLoading(false);
    }
  };

  if (!isMaster && currentClientUser) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
              <Building size={24} />
            </div>
            <div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 uppercase tracking-wider">
                Assigned Refinery Organization
              </span>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{currentClientUser.name}</h1>
              <p className="text-xs text-slate-500">{currentClientUser.description || "Petrochemical Refinery Unit"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">Assigned Coke Drums</span>
              <p className="text-2xl font-bold text-sky-700 mt-1">{currentClientUser.assignedDrums.length}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">Inspection Campaigns</span>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{currentClientUser.inspectionsCount}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold">Team Members</span>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{currentClientUser.assignedUsers.length}</p>
            </div>
          </div>
        </div>

        {/* Assigned Drums Card Fleet */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database size={18} className="text-sky-600" />
            <span>Your Assigned Coke Drum Fleet ({currentClientUser.assignedDrums.length})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {currentClientUser.assignedDrums.map((drum) => (
              <div key={drum.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-base">{drum.name}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    ASSIGNED
                  </span>
                </div>
                <p className="text-xs text-slate-500">{drum.description || "Petrochemical Coke Drum Vessel"}</p>

                <div className="flex items-center gap-2 pt-2">
                  <Link
                    href={`/analysis?drumId=${drum.id}`}
                    className="flex-1 text-center py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded-lg text-xs font-bold transition"
                  >
                    Analysis
                  </Link>
                  <Link
                    href={`/reports`}
                    className="flex-1 text-center py-2 bg-sky-600 text-white hover:bg-sky-700 rounded-lg text-xs font-bold shadow-xs transition"
                  >
                    Reports
                  </Link>
                </div>
              </div>
            ))}

            {currentClientUser.assignedDrums.length === 0 && (
              <div className="col-span-full bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                No Coke Drums currently assigned to your client profile. Please contact your Master Administrator.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Refinery Client Management Console</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create client organizations, assign Coke Drum vessels, and manage client user accounts for multi-tenant access
          </p>
        </div>

        {isMaster && (
          <button
            onClick={() => setShowCreateClientModal(true)}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus size={16} />
            <span>Create New Client</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg("")} className="text-red-500 hover:text-red-800">
            <X size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Clients Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clientsList.map((client) => (
          <div key={client.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 flex flex-col justify-between group hover:border-sky-300 transition">
            <div className="space-y-4">
              {/* Card Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 flex items-center justify-center font-bold">
                    <Building size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition">{client.name}</h3>
                    <p className="text-[11px] text-slate-500">{client.description || "Refinery Petrochemical Unit"}</p>
                  </div>
                </div>

                {isMaster && (
                  <button
                    onClick={() => setDeletingClient(client)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete Client"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Assigned Coke Drums Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Database size={14} className="text-sky-600" />
                    <span>Assigned Coke Drums ({client.assignedDrums.length})</span>
                  </span>
                  {isMaster && (
                    <button
                      onClick={() => openAssignDrumsModal(client)}
                      className="text-[11px] font-bold text-sky-700 hover:text-sky-900 hover:bg-sky-50 px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1"
                    >
                      <Settings2 size={12} />
                      <span>Manage</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {client.assignedDrums.map((drum) => (
                    <span key={drum.id} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                      {drum.name}
                    </span>
                  ))}
                  {client.assignedDrums.length === 0 && (
                    <span className="text-[11px] text-slate-400 italic">No drums assigned</span>
                  )}
                </div>
              </div>

              {/* Assigned Users Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Users size={14} className="text-indigo-600" />
                    <span>User Accounts ({client.assignedUsers.length})</span>
                  </span>
                  {isMaster && (
                    <button
                      onClick={() => {
                        clearNotifications();
                        setUserModalClient(client);
                      }}
                      className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1"
                    >
                      <UserPlus size={12} />
                      <span>Add User</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {client.assignedUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 truncate">{user.name || user.email}</p>
                        <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                      </div>
                      {isMaster && (
                        <button
                          onClick={() => handleDeleteUser(client.id, user.id)}
                          className="p-1 text-slate-400 hover:text-red-600 transition"
                          title="Delete user"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {client.assignedUsers.length === 0 && (
                    <span className="text-[11px] text-slate-400 italic">No client users created</span>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Summary */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Inspections: <strong>{client.inspectionsCount}</strong></span>
              <span className="text-emerald-600 font-bold">Active Tenant</span>
            </div>
          </div>
        ))}

        {clientsList.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200 space-y-3">
            <Building size={32} className="mx-auto text-slate-400" />
            <p className="font-bold text-slate-700">No Client Organizations Found</p>
            <p className="text-slate-500">Click "Create New Client" to set up your first refinery client organization.</p>
          </div>
        )}
      </div>

      {/* 1. Create Client Modal */}
      {showCreateClientModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create New Refinery Client</h3>
              <button onClick={() => setShowCreateClientModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Client Organization Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Refinery Alpha (Delayed Coking Unit)"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Refinery Notes</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Primary delayed coking unit with 4 heavy vessel drums"
                  value={newClientDesc}
                  onChange={(e) => setNewClientDesc(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateClientModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                >
                  {loading ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Assign Coke Drums Modal */}
      {assigningClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign Coke Drums</h3>
                <p className="text-xs text-slate-500">Select vessels assigned to <strong>{assigningClient.name}</strong></p>
              </div>
              <button onClick={() => setAssigningClient(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {allDrumsList.map((drum) => {
                const isChecked = selectedDrumIds.includes(drum.id);
                const assignedToOther = drum.clientId && drum.clientId !== assigningClient.id;
                const otherClient = clientsList.find(c => c.id === drum.clientId);

                return (
                  <label
                    key={drum.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition ${
                      isChecked
                        ? "bg-sky-50/80 border-sky-300 font-bold text-sky-900"
                        : "bg-slate-50/50 border-slate-200 hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDrumIds((prev) => [...prev, drum.id]);
                          } else {
                            setSelectedDrumIds((prev) => prev.filter((id) => id !== drum.id));
                          }
                        }}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                      />
                      <div>
                        <p className="font-bold text-slate-900">{drum.name}</p>
                        <p className="text-[11px] text-slate-500">{drum.description || "Coke Drum Vessel"}</p>
                      </div>
                    </div>

                    {assignedToOther && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Currently: {otherClient?.name || `Client #${drum.clientId}`}
                      </span>
                    )}
                  </label>
                );
              })}

              {allDrumsList.length === 0 && (
                <p className="text-xs text-slate-500 text-center italic py-4">
                  No Coke Drums registered in the system yet. Upload an inspection matrix to auto-detect drums.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssigningClient(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDrumAssignments}
                disabled={loading}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                {loading ? "Saving..." : "Save Drum Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Client User Modal */}
      {userModalClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create Client Login Account</h3>
                <p className="text-xs text-slate-500">Add user credential for <strong>{userModalClient.name}</strong></p>
              </div>
              <button onClick={() => setUserModalClient(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">User Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe (Plant Inspector)"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Login Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. inspector@refinery.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Account Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Enter initial password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserModalClient(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                >
                  {loading ? "Creating..." : "Create User Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Delete Client Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-red-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 border-b border-red-100 pb-3">
              <ShieldAlert size={24} />
              <h3 className="text-base font-bold text-slate-900">Delete Client Organization</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong>{deletingClient.name}</strong>?
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 space-y-1">
              <p className="font-bold">This operation will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-900">
                <li>Unassign all {deletingClient.assignedDrums.length} Coke Drums (making them unassigned).</li>
                <li>Permanently delete {deletingClient.assignedUsers.length} client user account logins.</li>
                <li>Remove the client organization record.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingClient(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClientConfirm}
                disabled={loading}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                {loading ? "Deleting..." : "Yes, Delete Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
