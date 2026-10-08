import type {QuantyCapabilityManifest} from '@quant/quanty-contracts';
export const DEFAULT_QUANTY_CAPABILITIES:QuantyCapabilityManifest[]=[
{product:'quantmail',version:'v1',platformSupport:['web','android','ios','tauri','desktop'],updatedAt:'2026-10-08T00:00:00.000Z',capabilities:[
{name:'mail.draft.create',description:'Create an email draft',riskTier:1,resourceScopes:['mail.message'],toolIds:['quantmail.draft.create']},
{name:'mail.send',description:'Send an email',riskTier:3,resourceScopes:['mail.message'],toolIds:['quantmail.send']} ]},
{product:'quantchat',version:'v1',platformSupport:['web','android','ios','tauri','desktop'],updatedAt:'2026-10-08T00:00:00.000Z',capabilities:[
{name:'chat.message.draft',description:'Draft a message',riskTier:1,resourceScopes:['chat.message'],toolIds:['quantchat.message.draft']},
{name:'chat.message.send',description:'Send a message',riskTier:3,resourceScopes:['chat.message'],toolIds:['quantchat.message.send']},
{name:'chat.meet.start',description:'Start a QuantMeet session',riskTier:3,resourceScopes:['chat.meeting'],toolIds:['quantchat.meet.start']}]},
{product:'quantmax',version:'v1',platformSupport:['web','android','ios','tauri','desktop'],updatedAt:'2026-10-08T00:00:00.000Z',capabilities:[
{name:'game.search',description:'Find a game',riskTier:0,resourceScopes:['quantmax.game'],toolIds:['quantmax.game.search']},
{name:'game.launch',description:'Launch a game',riskTier:2,resourceScopes:['quantmax.game','quantmax.session'],toolIds:['quantmax.game.launch']},
{name:'game.matchmaking.start',description:'Join matchmaking',riskTier:2,resourceScopes:['quantmax.matchmaking'],toolIds:['quantmax.matchmaking.start']}]}
];