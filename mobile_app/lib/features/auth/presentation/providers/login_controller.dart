import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/providers/auth_state_provider.dart';
import '../../data/auth_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository());

final loginControllerProvider = Provider<LoginController>((ref) {
  return LoginController(
    repository: ref.watch(authRepositoryProvider),
    authNotifier: ref.read(authStateProvider.notifier),
  );
});

class LoginController {
  LoginController({
    required AuthRepository repository,
    required AuthStateNotifier authNotifier,
  })  : _repository = repository,
        _authNotifier = authNotifier;

  final AuthRepository _repository;
  final AuthStateNotifier _authNotifier;

  Future<void> signIn({
    required String username,
    required String password,
  }) async {
    await _repository.login(username: username, password: password);
    _authNotifier.signIn(username);
  }
}
