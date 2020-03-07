import React from 'react';
import {
  Header,
  Left,
  Body,
  Right,
  Button,
  Icon as Icon_,
  Container,
  Item,
  Input,
  Thumbnail,
  Spinner,
  DeckSwiper,
  Card,
  CardItem,
  cardBody,
} from 'native-base';

import ImageLoad from 'react-native-image-placeholder';
import Autocomplete from 'react-native-autocomplete-input';

import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
  TouchableHighlight,
} from 'react-native';

import {getData, postData} from '../helpers/httpServices';
import {getDataFromToken} from '../helpers/tokenutils';
import ImageSliderForDeck from '../DumbComponents/ImageSliderForDeck';
import DeckCard from '../DumbComponents/DeckCard';
import Icon from 'react-native-vector-icons/Ionicons';
import baseurl from '../helpers/baseurl';
import CardStack, {Card as Card_} from 'react-native-card-stack-swiper';

let SCREEN_HEIGHT = Dimensions.get('window').height;
SCREEN_HEIGHT = SCREEN_HEIGHT - SCREEN_HEIGHT * 0.35;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default class Deck extends React.Component {
  constructor(props) {
    super(props);

    this.position = new Animated.ValueXY();
    this.state = {
      currentIndex: 0,
      users: [],
      filteredUsers: [],
      loading: false,
      userId: -1,
      modal: false,
      targetSocketId: -1,
      caller_info: {},
    };
  }

  loadUsers = async () => {
    this.setState({loading: true});
    let result = await getDataFromToken();
    if (result.ok) {
      let {id} = result.data;
      let response = await getData(`user/all-users-except-self/${id}`);
      await this.setState({filteredUsers: response.users, users: response.users});
      return id;
    }
  };

  makeLike = async index => {
    let profile = this.state.users[index];
    let data = {profileId: profile.id, userId: this.state.userId};
    let response = await postData(`like/create`, data);
  };

  componentDidMount = async () => {
    let userId = await this.loadUsers();
    await this.setState({userId, loading: false});
    this.socket = this.props.screenProps.socketRef;
    this.socket.on(
      'on-call-request',
      async function(data) {
        await this.setState({modal: true, targetSocketId: data.socket, caller_info: data.info});
      }.bind(this),
    );
  };

  acceptCall = () => {
    this.socket.emit('acknowledge-call', {
      to: this.state.targetSocketId,
      code: 'accepted',
    });
    this.setState({modal: false, targetSocketId: -1, caller_info: {}});
    this.props.navigation.navigate('VideoChat');
  };

  rejectCall = () => {
    this.socket.emit('acknowledge-call', {
      to: this.state.targetSocketId,
      code: 'rejected',
    });
    this.setState({modal: false, targetSocketId: -1});
  };

  renderUsers = () => {
    return (
      <CardStack
        ref={swiper => {
          this.swiper = swiper;
        }}
        onSwipedRight={index => {
          this.makeLike(index);
        }}>
        {this.state.filteredUsers.map((item, index) => {
          return (
            <DeckCard
              makeLike={this.makeLike}
              index={index}
              profile={item}
              userId={this.state.userId}
              stackRef={this.props.screenProps.stackRef}
            />
          );
        })}
      </CardStack>
    );
  };

  filterDeck = async text => {
    if (text === '') {
      let userId = await this.loadUsers();
      await this.setState({userId, loading: false});
    } else {
      let result = await getData(`user/getUsersByPattern/${text}`);
      if (result.ok) {
        this.setState({filteredUsers: result.users});
      } else {
        alert('technical error');
      }
    }
  };

  render() {
    return (
      <Container>
        <Modal animationType="slide" transparent={false} visible={this.state.modal}>
          <Container style={{backgroundColor: 'white'}}>
            <View style={{flex: 1, justifyContent: 'space-around', alignItems: 'center'}}>
              <ImageLoad
                source={{uri: `${baseurl}/user_images/${this.state.caller_info.profile_pic}`}}
                style={{width: 200, height: 200, borderRadius: 100}}
              />
              <Text style={{fontSize: 40}}>{this.state.caller_info.username}</Text>
              <Text style={{fontSize: 20}}>Is Calling You ...</Text>
            </View>
            <View style={{flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center'}}>
              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 100,
                  height: 100,
                  backgroundColor: 'green',
                  borderRadius: 50,
                }}
                onPress={() => {
                  this.acceptCall();
                }}>
                <Icon name={'md-checkmark'} size={60} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 100,
                  height: 100,
                  backgroundColor: 'red',
                  borderRadius: 50,
                }}
                onPress={() => {
                  this.rejectCall();
                }}>
                <Icon name={'md-close'} size={60} color="white" />
              </TouchableOpacity>
            </View>
          </Container>
        </Modal>
        <Header searchBar rounded>
          <Body>
            <Item style={{backgroundColor: 'white', width: '165%', height: '75%'}} rounded>
              <Icon_ name="search" style={{color: 'black'}} />
              <Input placeholder="Search" onChangeText={text => this.filterDeck(text)} rounded />
            </Item>
          </Body>

          <Right>
            <Thumbnail small source={require('../../images/g2.jpg')} />
          </Right>
        </Header>
        <View style={{flex: 1}}>
          {this.state.loading ? (
            <View style={{justifyContent: 'center', alignItems: 'center'}}>
              <Spinner color="white" />
            </View>
          ) : (
            <View style={{flex: 1}}>{this.renderUsers()}</View>
          )}
          <View style={{flex: 0.15, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center'}}>
            <TouchableOpacity
              style={{
                borderWidth: 3,
                borderColor: 'red',
                alignItems: 'center',
                justifyContent: 'center',
                width: 50,
                height: 50,
                backgroundColor: 'white',
                borderRadius: 25,
              }}
              onPress={() => {
                this.swiper.swipeLeft();
              }}>
              <Icon name={'md-thumbs-down'} size={30} color="red" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderWidth: 3,
                borderColor: 'orange',
                alignItems: 'center',
                justifyContent: 'center',
                width: 50,
                height: 50,
                backgroundColor: 'white',
                borderRadius: 25,
              }}
              onPress={async () => {
                let userId = await this.loadUsers();
                await this.setState({userId, loading: false});
              }}>
              <Icon name={'md-refresh'} size={30} color="orange" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                borderWidth: 3,
                borderColor: '#01a699',
                alignItems: 'center',
                justifyContent: 'center',
                width: 50,
                height: 50,
                backgroundColor: 'white',
                borderRadius: 25,
              }}
              onPress={() => {
                this.swiper.swipeRight();
              }}>
              <Icon name={'md-thumbs-up'} size={30} color="#01a699" />
            </TouchableOpacity>
          </View>
        </View>
        <View></View>
      </Container>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
