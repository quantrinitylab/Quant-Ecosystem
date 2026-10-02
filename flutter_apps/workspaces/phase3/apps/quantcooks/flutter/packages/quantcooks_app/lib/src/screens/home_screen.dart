// ============================================================================
// quantcooks_app - home placeholder (Shift 1 scaffold)
// ============================================================================

import 'package:flutter/material.dart';

/// Projects home screen — Shift 1 placeholder.
///
/// TODO(UNVERIFIED): replace with the real project list + project grid after
/// the QuantCooks API spec exists (app-foundations/quantcooks/openapi.yaml
/// is not built yet). No project data may be shown from invented endpoints.
class ProjectsHomeScreen extends StatelessWidget {
  /// Creates the projects home placeholder.
  const ProjectsHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.movie_creation_outlined,
                size: 64,
                color: scheme.onSurfaceVariant,
              ),
              const SizedBox(height: 16),
              Text(
                'No projects yet',
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'Your video and design projects will appear here once the '
                'QuantCooks project API is wired up.',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
