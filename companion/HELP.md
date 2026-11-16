## Overview

Nevion VideoIPath lets you route sources to destinations and monitor active routes from the control UI.

This module supports VideoIPath systems exposing the 2023 LTS API.

Use a VideoIPath UI user account for login. The account needs read access to the topology, so the module can tell video vertices from audio vertices.

## Quick Setup

Enter the VideoIPath host name or IP address, then set the port and HTTPS options to match your system.

Enter the username and password for a VideoIPath UI user account.

If your system uses a self-signed certificate, disable certificate validation.

Set the poll interval to control how often the module refreshes routing state.

Enable only the endpoint types you want to use in actions and feedbacks.

## First Route

1. Save the module configuration.
2. Wait for the source and destination lists to populate.
3. Add a route action for the endpoint type you want to control.
4. Select the source, destination, and conflict strategy.
5. Use `(Disconnect)` as the source to clear the selected destination.

## Vertices

Vertices are split by the codec format VideoIPath stores for each vertex in its topology:

- **Route Video Vertex**
- **Route Audio Vertex**
- **Route Ancillary Vertex**
- **Route ASI Vertex**
- **Route Other Vertex**: vertices with no codec format, or with extra formats, so they carry more than one essence

The module never guesses a format from labels or tags. If it can't read the topology, every vertex is listed under Route Other Vertex and the module shows a warning.

A format changed in VideoIPath shows up within a minute.

### Upgrading from version 1

Version 1 listed every vertex under one action, Route Video/Audio Vertex, which is now Route Other Vertex. Existing buttons keep routing the vertex they selected. The dropdown only lists vertices without a single format, so to edit one of these buttons, replace the action with the one for the vertex's format. The same applies to the Route Match feedbacks.

## Feedbacks

Route match feedbacks can highlight when a selected source is routed to a selected destination.

You can also use feedbacks to show when a destination is disconnected.

## Variables

Variables are available for source labels, destination labels, and the routed source ID for each destination.

## Notes

If the source or destination lists are empty, check that the login details are correct and that the module is connected.

If an endpoint type is disabled in the configuration, its actions and feedbacks are hidden.
