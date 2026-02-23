import type { SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	username: string
	password: string
	rejectUnauthorized: boolean
	pollInterval: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'This module connects to a Nevion VideoIPath media orchestration platform to route sources to destinations.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'VideoIPath Host',
			width: 8,
			default: '',
			required: true,
		},
		{
			type: 'number',
			id: 'port',
			label: 'HTTPS Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 443,
		},
		{
			type: 'textinput',
			id: 'username',
			label: 'Username',
			width: 6,
			default: '',
			required: true,
		},
		{
			type: 'textinput',
			id: 'password',
			label: 'Password',
			width: 6,
			default: '',
			required: true,
		},
		{
			type: 'checkbox',
			id: 'rejectUnauthorized',
			label: 'Validate SSL Certificate',
			width: 6,
			default: false,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll Interval (seconds)',
			width: 6,
			min: 1,
			max: 30,
			default: 2,
		},
	]
}
