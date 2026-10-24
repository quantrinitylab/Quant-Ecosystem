// Calendar, Drive and Contacts pillars: the views the app already had, moved
// out of the old 96 KB home screen with the same look. They hold no data yet.
// Buttons that used to show made-up snackbars now say plainly that the feature
// is not available in this version.

import 'package:flutter/material.dart';

import '../../design/components/components.dart';

void _notAvailable(BuildContext context, String what) {
  showQmToast(context, "$what isn't available in this version yet.");
}

const EdgeInsets _pagePadding = EdgeInsets.fromLTRB(12, 6, 12, 96);

Widget _card({required Widget child, EdgeInsets padding = const EdgeInsets.all(12), double radius = 16}) {
  return Container(
    padding: padding,
    decoration: BoxDecoration(
      color: const Color(0xFF14161D),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: const Color(0xFF232938)),
    ),
    child: child,
  );
}

Widget _pill({required Color color, required Widget child, required VoidCallback onTap, double radius = 10}) {
  return GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius)),
      child: child,
    ),
  );
}

class CalendarPillarView extends StatelessWidget {
  const CalendarPillarView({super.key});

  static const Color _accent = Color(0xFF4285F4);

  @override
  Widget build(BuildContext context) {
    final List<String> hours = List<String>.generate(24, (int i) {
      if (i == 0) return '12 AM';
      if (i < 12) return '$i AM';
      if (i == 12) return '12 PM';
      return '${i - 12} PM';
    });
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: _pagePadding,
      children: <Widget>[
        _card(
          child: Row(
            children: <Widget>[
              const Text('Calendar', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
              const Spacer(),
              _pill(
                color: _accent,
                onTap: () => _notAvailable(context, 'Creating events'),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(Icons.add_rounded, size: 16, color: Colors.white),
                    SizedBox(width: 4),
                    Text('Event', style: TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF0E1017),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF1E2330)),
          ),
          child: Column(
            children: <Widget>[
              for (final String hour in hours)
                Container(
                  height: 52,
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: Colors.white.withValues(alpha: 0.05))),
                  ),
                  child: Row(
                    children: <Widget>[
                      SizedBox(
                        width: 56,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 10, top: 6),
                          child: Text(
                            hour,
                            style: const TextStyle(color: Color(0xFF8B8B96), fontSize: 10.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                      Container(width: 1, color: Colors.white.withValues(alpha: 0.06)),
                      const Expanded(child: SizedBox()),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class DrivePillarView extends StatefulWidget {
  const DrivePillarView({super.key});

  @override
  State<DrivePillarView> createState() => _DrivePillarViewState();
}

class _DrivePillarViewState extends State<DrivePillarView> {
  static const Color _accent = Color(0xFF34A853);
  static const List<String> _filters = <String>['All', 'Folders', 'Docs', 'Images', 'Sheets', 'Archives'];

  String _activeFilter = 'All';

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: _pagePadding,
      children: <Widget>[
        _card(
          child: Column(
            children: <Widget>[
              Row(
                children: <Widget>[
                  const Icon(Icons.cloud_queue_rounded, size: 18, color: _accent),
                  const SizedBox(width: 8),
                  const Text('My Drive', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  _pill(
                    color: _accent,
                    radius: 8,
                    onTap: () => _notAvailable(context, 'Uploading files'),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(Icons.upload_rounded, size: 15, color: Colors.black),
                        SizedBox(width: 4),
                        Text('Upload', style: TextStyle(color: Colors.black, fontSize: 11.5, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: <Widget>[
                    for (final String f in _filters)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: GestureDetector(
                          onTap: () => setState(() => _activeFilter = f),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5.5),
                            decoration: BoxDecoration(
                              color: _activeFilter == f ? _accent.withValues(alpha: 0.18) : const Color(0xFF0E1017),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: _activeFilter == f ? _accent.withValues(alpha: 0.75) : const Color(0xFF232938),
                              ),
                            ),
                            child: Text(
                              f,
                              style: TextStyle(
                                color: _activeFilter == f ? _accent : const Color(0xFFA1A1AA),
                                fontSize: 11.5,
                                fontWeight: _activeFilter == f ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        _EmptyPillarCard(
          mascot: 'assets/mascots/drive-lg.png',
          title: 'This folder is empty',
          message: 'Drive files will appear here.',
        ),
      ],
    );
  }
}

class ContactsPillarView extends StatelessWidget {
  const ContactsPillarView({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
      children: const <Widget>[
        _EmptyPillarCard(
          mascot: 'assets/mascots/contacts-lg.png',
          title: 'No contacts yet',
          message: 'Contacts will appear here.',
        ),
      ],
    );
  }
}

class _EmptyPillarCard extends StatelessWidget {
  const _EmptyPillarCard({required this.mascot, required this.title, required this.message});

  final String mascot;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return _card(
      radius: 18,
      padding: const EdgeInsets.symmetric(vertical: 56, horizontal: 24),
      child: Column(
        children: <Widget>[
          Image.asset(mascot, width: 96, height: 96, fit: BoxFit.contain),
          const SizedBox(height: 16),
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFA1A1AA), fontSize: 12.5),
          ),
        ],
      ),
    );
  }
}
