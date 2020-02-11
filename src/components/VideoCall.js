import React from 'react';
import { StyleSheet, Text, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import RNCallKeep from 'react-native-callkeep';
import uuid from 'uuid';

import { RTCPeerConnection, RTCSessionDescription, MediaStream, getUserMedia, RTCView, MediaStreamTrack } from 'react-native-webrtc';

import { WazoApiClient, WazoWebRTCClient } from '@wazo/sdk';

// Polyfill WebRTC
global.MediaStream = MediaStream;
global.RTCSessionDescription = RTCSessionDescription;
global.RTCPeerConnection = RTCPeerConnection;
global.navigator.mediaDevices = {
  ...global.navigator.mediaDevices,
  getUserMedia: getUserMedia,
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff'
  },
  containerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: '80%',
  },
  button: {
    paddingTop: 50,
  },
  localVideo: {
    width: 200,
    height: 150,
  },
  remoteVideo: {
    width: 200,
    height: 150,
  },
});
const hitSlop = { top: 10, left: 10, right: 10, bottom: 10};

export default class VideoCall extends React.Component {

  constructor(props) {
    super(props);

    this.webRtcClient = null;
    this.currentCallId = null;
    this.currentSession = null;

    this.state = {
      server: 'demo.wazo.community',
      username: '',
      password: '',
      number: '',
      localVideoSrc: null,
      remoteVideoSrc: null,
      connected: false,
      ringing: false,
      inCall: false,
      error: null,
    };
  }

  initializeCallKeep = () => {
    // Initialise RNCallKit
    const options = {
      ios: {
        appName: 'WazoReactNativeDemo',
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'This application needs to access your phone accounts',
        cancelButton: 'Cancel',
        okButton: 'ok',
      }
    };

    try {
      RNCallKeep.setup(options);
      RNCallKeep.setActive(true);
    } catch (err) {
      console.error('initializeCallKeep error:', err.message);
    }

    // Add RNCallKit Events
    RNCallKeep.addEventListener('didReceiveStartCallAction', this.onNativeCall);
    RNCallKeep.addEventListener('answerCall', this.onAnswerCallAction);
    RNCallKeep.addEventListener('endCall', this.onEndCallAction);
    RNCallKeep.addEventListener('didDisplayIncomingCall', this.onIncomingCallDisplayed);
    RNCallKeep.addEventListener('didPerformSetMutedCallAction', this.onToggleMute);
    RNCallKeep.addEventListener('didPerformDTMFAction', this.onDTMF);
  };

  authenticate = () => {
    const { server, username, password } = this.state;
    const apiClient = new WazoApiClient({ server });

    apiClient.auth
      .logIn({ username, password })
      .then(data => {
        const userToken = data.token;

        apiClient.confd
          .getUser(userToken, data.uuid)
          .then(user => {
            const line = user.lines[0];

            apiClient.confd
              .getUserLineSip(data.token, data.uuid, line.id)
              .then(sipLine => {
                this.initializeWebRtc(sipLine, server);
                this.initializeCallKeep();
              })
              .catch(console.log);
          })
          .catch(console.log);
      })
      .catch(console.log);
  };

  getVideoSourceId = () => {
    if (Platform.OS !== 'ios') {
      // on android, you don't have to specify sourceId manually, just use facingMode
      return;
    }

    MediaStreamTrack.getSources(sourceInfos => {
      for (const i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if(sourceInfo.kind === 'video' && sourceInfo.facing === 'front') {
          return sourceInfo.id;
        }
      }
    });
  };

  initializeWebRtc = (sipLine, host) => {
    const videoSourceId = this.getVideoSourceId();

    this.webRtcClient = new WazoWebRTCClient({
      host,
      displayName: 'My react-native dialer',
      authorizationUser: sipLine.username,
      password: sipLine.secret,
      uri: sipLine.username + '@' + host,
      media: {
        audio: true,
        video: {
          mandatory: {
            minWidth: 640, // Provide your own width, height and frame rate here
            minHeight: 360,
            minFrameRate: 30,
          },
          facingMode: 'environment',
          optional: (videoSourceId ? [ {sourceId: videoSourceId} ] : []),
        }
      },
    });

    this.webRtcClient.on('invite', session => {
      this.setupCallSession(session);
      this.setState({ ringing: true });

      // Tell callkeep that we a call is incoming
      RNCallKeep.displayIncomingCall(this.getCurrentCallId(), this.webRtcClient.getNumber(session));
    });

    this.setState({ connected: true });
  };

  setupCallSession = session => {
    this.currentSession = session;

    session.on('failed', (response, cause) => {
      this.setState({ error: cause, ringing: false, inCall: false });
    });

    session.on('SessionDescriptionHandler-created', (sdh) => {
      sdh.on('userMedia', (stream) => {
        this.setState({ localVideoSrc: stream.toURL() });
      });

      sdh.on('addStream', (event) => {
        const { stream } = event;
        const tracks = stream.getTracks();

        if (tracks.length === 1 && tracks[0].kind === 'video') {
          this.setState({ remoteVideoSrc: stream.toURL() });
        } else if(tracks.length === 2) {
          this.setState({ remoteVideoSrc: stream.toURL() });
        }
      });
    });

    session.on('terminated', () => {
      this.hangup();
    });
  };

  call = (number) => {
    const session = this.webRtcClient.call(number);
    this.setupCallSession(session);

    this.setState({ inCall: true, ringing: false });

    // Tell callkeep that we are in call
    RNCallKeep.startCall(this.getCurrentCallId(), number);
  };

  answer = () => {
    this.setState({ inCall: true, ringing: false });

    this.webRtcClient.answer(this.currentSession);
  };

  hangup = () => {
    const currentCallId = this.getCurrentCallId();
    if (!this.currentSession || !currentCallId) {
      return;
    }

    this.webRtcClient.hangup(this.currentSession);

    RNCallKeep.endCall(currentCallId);
    this.setState({ inCall: false, ringing: false });
    this.currentCallId = null;
    this.currentSession = null;
  };

  getCurrentCallId = () => {
    if (!this.currentCallId) {
      this.currentCallId = uuid.v4();
    }

    return this.currentCallId;
  };

  onAnswerCallAction = ({ callUUID }) => {
    // called when the user answer the incoming call
    this.answer();
  };

  onIncomingCallDisplayed = error => {
    // You will get this event after RNCallKeep finishes showing incoming call UI
    // You can check if there was an error while displaying
  };

  onNativeCall = ({ handle }) => {
    // Called when performing call from native Contact app
    this.call(handle);
  };

  onEndCallAction = ({ callUUID }) => {
    this.hangup();
  };

  onToggleMute = (muted) => {
    // Called when the system or the user mutes a call
    this.webRtcClient[muted ? 'mute' : 'unmute'](this.currentSession);
  };

  onDTMF = (action) => {
    console.log('onDTMF', action);
  };

  render() {
    const { connected, server } = this.state;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.containerContent} keyboardShouldPersistTaps="handled">
        {!connected && (
          <React.Fragment>
            <TextInput autoCapitalize="none" onChangeText={username => this.setState({ username })} placeholder="Username" value={this.state.username} style={styles.input} />
            <TextInput autoCapitalize="none" onChangeText={password => this.setState({ password })} placeholder="Password" value={this.state.password} style={styles.input} />
            <TextInput autoCapitalize="none" defaultValue={server} onChangeText={server => this.setState({ server })} placeholder="Server" style={styles.input} />

            <TouchableOpacity onPress={this.authenticate.bind(this)} style={styles.button} hitSlop={hitSlop}>
              <Text>Login</Text>
            </TouchableOpacity>
          </React.Fragment>
        )}

        {connected && (
          <React.Fragment>
            <RTCView streamURL={this.state.localVideoSrc} style={styles.localVideo} />

            <RTCView streamURL={this.state.remoteVideoSrc} style={styles.remoteVideo} />
            <TextInput
              autoCapitalize="none"
              keyboardType="numeric"
              onChangeText={number => this.setState({ number })}
              onSubmitEditing={this.call.bind(this)}
              placeholder="Number"
              style={styles.input}
              value={this.state.number}
            />

            {!this.state.ringing && !this.state.inCall && (
              <TouchableOpacity onPress={() => this.call(this.state.number)} style={styles.button} hitSlop={hitSlop}>
                <Text>Call</Text>
              </TouchableOpacity>
            )}
            {this.state.ringing && (
              <TouchableOpacity onPress={this.answer} style={styles.button} hitSlop={hitSlop}>
                <Text>Answer</Text>
              </TouchableOpacity>
            )}
            {this.state.inCall && (
              <TouchableOpacity onPress={this.hangup} style={styles.button} hitSlop={hitSlop}>
                <Text>Hangup</Text>
              </TouchableOpacity>
            )}
          </React.Fragment>
        )}
      </ScrollView>
    );
  }
}