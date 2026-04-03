import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_client_provider.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/providers/auth_state_provider.dart';
import 'models/auth_user.dart';

class AuthRepository {
  AuthRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<AuthUser> login({
    required String username,
    required String password,
  }) async {
    if (username.isEmpty || password.isEmpty) {
      throw const ApiException('用户名和密码不能为空');
    }
    final data = await _apiClient.post(
      '/auth/login',
      data: {
        'identifier': username,
        'password': password,
      },
    );
    return _parseUser(data);
  }

  Future<AuthUser?> getCurrentUser() async {
    final data = await _apiClient.post('/auth/me');
    return _parseUserOrNull(data);
  }

  Future<void> logout() async {
    await _apiClient.post('/auth/logout');
    await _apiClient.clearCookies();
  }

  AuthUser _parseUser(Map<String, dynamic> data) {
    final user = _parseUserOrNull(data);
    if (user == null) {
      throw const ApiException('未获取到用户信息');
    }
    return user;
  }

  AuthUser? _parseUserOrNull(Map<String, dynamic> data) {
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      return null;
    }
    return AuthUser.fromMap(user);
  }

  Future<void> restoreSession(AuthStateNotifier authNotifier) async {
    try {
      final user = await getCurrentUser();
      if (user == null) {
        authNotifier.signOut();
        return;
      }
      authNotifier.setUser(user);
    } on ApiException {
      authNotifier.signOut();
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(apiClient: ref.watch(apiClientProvider));
});
