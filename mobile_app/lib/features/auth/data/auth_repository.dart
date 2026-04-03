import '../../../core/storage/token_storage.dart';

class AuthRepository {
  AuthRepository({TokenStorage? tokenStorage}) : _tokenStorage = tokenStorage ?? TokenStorage();

  final TokenStorage _tokenStorage;

  Future<void> login({
    required String username,
    required String password,
  }) async {
    if (username.isEmpty || password.isEmpty) {
      throw Exception('用户名和密码不能为空');
    }
    await _tokenStorage.saveToken('demo-token');
  }

  Future<void> logout() => _tokenStorage.clear();
}
