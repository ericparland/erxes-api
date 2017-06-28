import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';
import { Users } from './connectors';

function jSONidentity(value) {
  return value;
}

function jSONparseLiteral(ast) {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT: {
      const value = Object.create(null);
      ast.fields.forEach(field => {
        value[field.name.value] = jSONparseLiteral(field.value);
      });

      return value;
    }
    case Kind.LIST:
      return ast.values.map(jSONparseLiteral);
    default:
      return null;
  }
}

export default {
  Date: new GraphQLScalarType({
    name: 'Date',

    description: 'Date custom scalar type',

    parseValue(value) {
      return new Date(value); // value from the client
    },

    serialize(value) {
      return value.getTime(); // value sent to the client
    },

    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10); // ast value is always in string format
      }
      return null;
    },
  }),

  JSON: new GraphQLScalarType({
    name: 'JSON',

    description:
      'The `jSON` scalar type represents jSON values as specified by ' +
        '[ECMA-404](http://www.ecma-international.org/' +
        'publications/files/ECMA-ST/ECMA-404.pdf).',

    serialize: jSONidentity,

    parseValue: jSONidentity,

    parseLiteral: jSONparseLiteral,
  }),

  Field: {
    name(field) {
      return `erxes-form-field-${field._id}`;
    },
  },

  Message: {
    user(message) {
      return Users.findOne({ _id: message.userId });
    },

    engageData(message) {
      const engageData = message.engageData;

      if (engageData) {
        return {
          fromUser: Users.findOne({ _id: engageData.fromUserId }),
          ...engageData,
        }
      }

      return {};
    },
  },

  Conversation: {
    participatedUsers(conversation) {
      return Users.find({ _id: { $in: conversation.participatedUserIds } });
    },
  },
};
