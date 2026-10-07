import { describe, it, expect } from 'vitest';
import { CardDAVServer } from '../carddav-server.js';

describe('CardDAVServer', () => {
  it('creates an address book', () => {
    const server = new CardDAVServer();
    server.createAddressBook({
      id: 'contacts',
      displayName: 'My Contacts',
      ownerPrincipal: 'alice',
    });

    expect(server.getAddressBooks()).toHaveLength(1);
    expect(server.getAddressBooks()[0]!.displayName).toBe('My Contacts');
  });

  it('handles PROPFIND to list address books', () => {
    const server = new CardDAVServer();
    server.createAddressBook({
      id: 'contacts',
      displayName: 'Contacts',
      ownerPrincipal: 'alice',
    });

    const response = server.handle({ method: 'PROPFIND', path: '/addressbooks/alice/' });
    expect(response.status).toBe(207);
    const body = JSON.parse(response.body);
    expect(body.multistatus.responses).toHaveLength(1);
  });

  it('handles PUT to create a new contact', () => {
    const server = new CardDAVServer();
    server.createAddressBook({
      id: 'contacts',
      displayName: 'Contacts',
      ownerPrincipal: 'alice',
    });

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'UID:contact-1',
      'FN:John Doe',
      'N:Doe;John;;;',
      'EMAIL:john@example.com',
      'TEL:+1234567890',
      'END:VCARD',
    ].join('\r\n');

    const response = server.handle({
      method: 'PUT',
      path: '/addressbooks/alice/contacts/contact-1.vcf',
      body: vcard,
    });

    expect(response.status).toBe(201);
    expect(server.getContacts('contacts')).toHaveLength(1);
    expect(server.getContacts('contacts')[0]!.fullName).toBe('John Doe');
  });

  it('handles DELETE to remove a contact', () => {
    const server = new CardDAVServer();
    server.createAddressBook({
      id: 'contacts',
      displayName: 'Contacts',
      ownerPrincipal: 'alice',
    });

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'UID:contact-2',
      'FN:Jane Smith',
      'END:VCARD',
    ].join('\r\n');

    server.handle({
      method: 'PUT',
      path: '/addressbooks/alice/contacts/contact-2.vcf',
      body: vcard,
    });
    const delResp = server.handle({
      method: 'DELETE',
      path: '/addressbooks/alice/contacts/contact-2.vcf',
    });

    expect(delResp.status).toBe(204);
    expect(server.getContacts('contacts')).toHaveLength(0);
  });

  it('handles REPORT with search filter', () => {
    const server = new CardDAVServer();
    server.createAddressBook({
      id: 'contacts',
      displayName: 'Contacts',
      ownerPrincipal: 'bob',
    });

    const vcard1 = ['BEGIN:VCARD', 'VERSION:4.0', 'UID:c1', 'FN:Alice Walker', 'END:VCARD'].join(
      '\r\n',
    );
    const vcard2 = ['BEGIN:VCARD', 'VERSION:4.0', 'UID:c2', 'FN:Bob Builder', 'END:VCARD'].join(
      '\r\n',
    );

    server.handle({ method: 'PUT', path: '/addressbooks/bob/contacts/c1.vcf', body: vcard1 });
    server.handle({ method: 'PUT', path: '/addressbooks/bob/contacts/c2.vcf', body: vcard2 });

    const filter = JSON.stringify({ search: 'alice' });
    const response = server.handle({
      method: 'REPORT',
      path: '/addressbooks/bob/contacts/',
      body: filter,
    });

    expect(response.status).toBe(207);
    const body = JSON.parse(response.body);
    expect(body.multistatus.responses).toHaveLength(1);
  });

  it('returns 404 for non-existent address book', () => {
    const server = new CardDAVServer();
    const response = server.handle({ method: 'PROPFIND', path: '/addressbooks/alice/nonexist/' });
    expect(response.status).toBe(404);
  });
});
