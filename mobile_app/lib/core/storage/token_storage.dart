import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  TokenStorage({FlutterSecureStorage? secureStorage}) : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _secureStorage;
  static const _tokenKey = 'letoume_access_token';

  Future<void> saveToken(String token) => _secureStorage.write(key: _tokenKey, value: token);

  Future<String?> readToken() => _secureStorage.read(key: _tokenKey);

  Future<void> clear() => _secureStorage.delete(key: _tokenKey);
}
