{{/*
Expand the name of the chart.
*/}}
{{- define "quantchat-backend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "quantchat-backend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version label.
*/}}
{{- define "quantchat-backend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "quantchat-backend.labels" -}}
helm.sh/chart: {{ include "quantchat-backend.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: quant-platform
{{ include "quantchat-backend.selectorLabels" . }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "quantchat-backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "quantchat-backend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Name of the Kubernetes Secret that holds the sensitive values. Defaults to
"<fullname>-secrets" when secrets.existingSecret is not set. NOTE: this chart
only REFERENCES the Secret; it never creates it with plaintext values.
*/}}
{{- define "quantchat-backend.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "quantchat-backend.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Name of the service account to use.
*/}}
{{- define "quantchat-backend.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "quantchat-backend.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
