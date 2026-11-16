## Overview

Nevion VideoIPath lets you route sources to destinations and monitor active routes from the control UI.

This module supports VideoIPath systems exposing the 2023 LTS API.

Use a VideoIPath UI user account for login. The account needs read access to the topology for the codec format variables.

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

## Feedbacks

Route match feedbacks can highlight when a selected source is routed to a selected destination.

You can also use feedbacks to show when a destination is disconnected.

## Variables

Variables are available for source labels, destination labels, and the routed source ID for each destination.

Each vertex also has a codec format variable, such as `src_..._format`, with the format VideoIPath stores for the vertex in its topology: `video`, `audio`, `ancillary` or `asi`. It's empty when VideoIPath stores no codec format for the vertex, or extra formats, so it carries more than one essence. The module never guesses a format from labels or tags. If it can't read the topology, these variables stay empty and the module shows a warning. A format changed in VideoIPath shows up within a minute.

## Notes

If the source or destination lists are empty, check that the login details are correct and that the module is connected.

If an endpoint type is disabled in the configuration, its actions and feedbacks are hidden.
