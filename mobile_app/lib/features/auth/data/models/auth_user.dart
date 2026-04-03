class AuthUser {
  const AuthUser({
    required this.id,
    required this.username,
    required this.nickname,
    required this.role,
    required this.roleName,
    required this.isActive,
    required this.permissions,
    this.email,
    this.avatarUrl,
    this.lastLoginAt,
    this.createdAt,
  });

  final int id;
  final String username;
  final String nickname;
  final String role;
  final String roleName;
  final bool isActive;
  final List<String> permissions;
  final String? email;
  final String? avatarUrl;
  final String? lastLoginAt;
  final String? createdAt;

  factory AuthUser.fromMap(Map<String, dynamic> json) {
    return AuthUser(
      id: (json['id'] as num?)?.toInt() ?? 0,
      username: json['username']?.toString() ?? '',
      nickname: json['nickname']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      roleName: json['role_name']?.toString() ?? '',
      isActive: json['is_active'] == true,
      permissions: (json['permissions'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      email: json['email']?.toString(),
      avatarUrl: json['avatar_url']?.toString(),
      lastLoginAt: json['last_login_at']?.toString(),
      createdAt: json['created_at']?.toString(),
    );
  }
}
