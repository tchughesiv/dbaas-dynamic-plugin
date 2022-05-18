import React from 'react'
import * as _ from 'lodash'
import {
  Button,
  Alert,
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  FormSelect,
  FormSelectOption,
  ValidatedOptions,
  Popover,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core'
import { getCSRFToken, fetchInvAndConnNamespacesFromConfigs } from '../utils'
import { HelpIcon, ExternalLinkAltIcon } from '@patternfly/react-icons'
import {
  mongoFetchCredentialsUrl,
  crunchyFetchCredentialsUrl,
  cockroachFetchCredentialsUrl,
  mongoProviderType,
  crunchyProviderType,
  cockroachdbProviderType,
  prerequisitesUrl,
  mongoUrl,
  crunchyUrl,
  cockroachUrl,
  mongoShortName,
  crunchyShortName,
  cockroachShortName,
  DBaaSInventoryCRName,
  DBaaSConfigCRName,
} from '../const'

class ProviderAccountForm extends React.Component {
  constructor(props) {
    super(props)
    this.installNamespace = props.installNamespace
    this.handleDBProviderSelection = this.handleDBProviderSelection.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
    this.validateField = this.validateField.bind(this)
    this.validateForm = this.validateForm.bind(this)
    this.validateInventoryNameField = this.validateInventoryNameField.bind(this)

    this.state = {
      createProviderAccountDocUrl: '',
      credentialDocUrl: '',
      credentials: {},
      currentNS: window.location.pathname.split('/')[3],
      inventoryName: '',
      inventoryNamespaces: [],
      selectedDBProvider: {},
      dbProviderOptions: [{ value: '', label: 'Select provider' }],
      postResponse: '',
      showError: false,
      showResults: true,
      error: {},
      isFormValid: false,
      isInventoryNameFieldValid: '',
      inventoryNameFieldInvalidText: '',
      providerShortName: 'provider',
      configUrl: window.location.pathname.replace(DBaaSInventoryCRName, DBaaSConfigCRName),
    }
  }

  async componentDidUpdate(prevProps, prevState) {
    if (!_.isEmpty(this.props.dbProviderInfo) && prevProps.dbProviderInfo !== this.props.dbProviderInfo) {
      let dbProviderList = []
      let namespaces = await fetchInvAndConnNamespacesFromConfigs(this.installNamespace)
      this.setState({ inventoryNamespaces: namespaces.uniqInventoryNamespaces })
      if (this.state.inventoryNamespaces.includes(this.state.currentNS)) {
        this.props.dbProviderInfo.items.forEach((dbProvider) => {
          dbProviderList.push({ value: dbProvider?.metadata?.name, label: dbProvider?.spec?.provider?.displayName })
        })
      } else {
        this.setState({ showResults: false })
      }
      this.setState({ dbProviderOptions: this.state.dbProviderOptions.concat(dbProviderList) })
    }
    if (
      prevState.isInventoryNameFieldValid !== this.state.isInventoryNameFieldValid &&
      !_.isEmpty(this.state.selectedDBProvider)
    ) {
      this.validateForm()
    }
    if (prevState.selectedDBProvider?.metadata?.name !== this.state.selectedDBProvider?.metadata?.name) {
      this.validateForm()
      this.setState({ credentials: {} })
    }
  }

  validateForm = () => {
    let isValid = _.every(this.state.selectedDBProvider?.spec?.credentialFields, (field) => {
      return field.isValid === ValidatedOptions.default
    })
    isValid = isValid && this.state.isInventoryNameFieldValid === ValidatedOptions.default
    this.setState({ isFormValid: isValid })
  }

  validateInventoryNameField = (value) => {
    let pattern = '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
    let regEx = new RegExp(pattern)
    let validField = ValidatedOptions.error
    let text = ''
    if (_.isEmpty(value)) {
      text = 'This is a required field'
    } else if (!regEx.test(value)) {
      text =
        "Must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character; regex used for validation is " +
        pattern
    } else if (value.length > 63) {
      text = 'Should be no more than 63 characters'
    } else {
      validField = ValidatedOptions.default
    }
    this.setState({ isInventoryNameFieldValid: validField })
    this.setState({ inventoryNameFieldInvalidText: text })
  }

  validateField = (value, field) => {
    let newProviderObj = _.extend({}, this.state.selectedDBProvider)
    let currentField = _.find(newProviderObj?.spec?.credentialFields, (credentialField) => {
      return credentialField.key === field.key
    })

    if (currentField) {
      if (_.isEmpty(value)) {
        currentField.isValid = ValidatedOptions.error
      } else {
        currentField.isValid = ValidatedOptions.default
      }
    }

    this.setState({ selectedDBProvider: newProviderObj })
  }

  handleDBProviderSelection = (value) => {
    if (!_.isEmpty(this.props.dbProviderInfo)) {
      let provider = _.find(this.props.dbProviderInfo.items, (dbProvider) => {
        return dbProvider.metadata?.name === value
      })
      if (provider?.spec?.credentialFields) {
        provider.spec.credentialFields.forEach((field) => {
          field.isValid = ''
          field.value = ''
        })
      }
      if (provider?.metadata?.name === mongoProviderType) {
        this.setState({
          credentialDocUrl: mongoFetchCredentialsUrl,
          createProviderAccountDocUrl: mongoUrl,
          providerShortName: mongoShortName,
        })
      }
      if (provider?.metadata?.name === crunchyProviderType) {
        this.setState({
          credentialDocUrl: crunchyFetchCredentialsUrl,
          createProviderAccountDocUrl: crunchyUrl,
          providerShortName: crunchyShortName,
        })
      }
      if (provider?.metadata?.name === cockroachdbProviderType) {
        this.setState({
          credentialDocUrl: cockroachFetchCredentialsUrl,
          createProviderAccountDocUrl: cockroachUrl,
          providerShortName: cockroachShortName,
        })
      }
      this.setState({ selectedDBProvider: provider })
    }
  }

  handleCancel = () => {
    window.history.back()
  }

  handleSubmit = async (event) => {
    event.preventDefault()

    let secretName = 'dbaas-vendor-credentials-' + Date.now()
    const { selectedDBProvider, inventoryName, credentials, isFormValid } = this.state

    if (!isFormValid) return

    let labelsMap = new Map([['related-to', 'dbaas-operator']])
    let providerName = ''
    let labelKey = 'db-operator/type'

    providerName = selectedDBProvider?.metadata?.name
    if (providerName.includes('mongodb')) {
      labelKey = 'atlas.mongodb.com/type'
    }
    labelsMap.set(labelKey, 'credentials')

    let newSecret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace: this.state.currentNS,
        labels: Object.fromEntries(labelsMap),
      },
      stringData: credentials,
      type: 'Opaque',
    }

    let postSecretRequestOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRFToken': getCSRFToken(),
      },
      body: JSON.stringify(newSecret),
    }

    await fetch('api/kubernetes/api/v1/namespaces/' + this.state.currentNS + '/secrets', postSecretRequestOpts)
      .then((response) => response.json())
      .then((data) => {
        this.setState({ postResponse: data })
      })
      .catch((err) => {
        if (err?.response?.status == 404) {
          console.warn(err)
        } else {
          console.warn(err)
        }
      })

    let requestOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRFToken': getCSRFToken(),
      },
      body: JSON.stringify({
        apiVersion: 'dbaas.redhat.com/v1alpha1',
        kind: 'DBaaSInventory',
        metadata: {
          name: inventoryName,
          namespace: this.state.currentNS,
          labels: {
            'related-to': 'dbaas-operator',
            type: 'dbaas-vendor-service',
          },
        },
        spec: {
          providerRef: {
            name: selectedDBProvider?.metadata?.name,
          },
          credentialsRef: {
            name: secretName,
            namespace: this.state.currentNS,
          },
        },
      }),
    }
    fetch(
      '/api/kubernetes/apis/dbaas.redhat.com/v1alpha1/namespaces/' + this.state.currentNS + '/dbaasinventories',
      requestOpts
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.status === 'Failure') {
          this.setState({ showError: true, error: data })
        } else {
          this.props.setCurrentCreatedInventoryInfo(data)
          let patchPayload = [
            {
              op: 'add',
              path: '/metadata/ownerReferences',
              value: [
                {
                  apiVersion: 'dbaas.redhat.com/v1alpha1',
                  kind: 'DBaaSInventory',
                  name: inventoryName,
                  uid: data.metadata.uid,
                  controller: true,
                  blockOwnerDeletion: false,
                },
              ],
            },
          ]

          let patchSecretRequestOpts = {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json-patch+json',
              Accept: 'application/json',
              'X-CSRFToken': getCSRFToken(),
            },
            body: JSON.stringify(patchPayload),
          }

          fetch(
            'api/kubernetes/api/v1/namespaces/' + this.state.currentNS + '/secrets/' + secretName,
            patchSecretRequestOpts
          )
            .then((response) => response.json())
            .then((data) => {
              if (data.status === 'Failure') {
                this.setState({ showError: true, error: data })
              } else {
                this.props.setDBaaSServiceStatus(true)
              }
            })
            .catch((err) => {
              if (err?.response?.status == 404) {
                console.warn(err)
              } else {
                console.warn(err)
              }
            })
        }
      })
  }

  render() {
    const {
      selectedDBProvider,
      showError,
      error,
      inventoryName,
      dbProviderOptions,
      credentials,
      isFormValid,
      isInventoryNameFieldValid,
      inventoryNameFieldInvalidText,
      credentialDocUrl,
      createProviderAccountDocUrl,
      providerShortName,
      configUrl,
    } = this.state

    return (
      <Form id="provider-account-form" isWidthLimited onSubmit={this.handleSubmit}>
        <>
          <Alert
            variant="info"
            isInline
            title="You must have an account with a supported database provider to use OpenShift Database Access."
            className="co-alert co-break-word"
          />
        </>
        {this.state.showResults ? (
          <div>
            {!_.isEmpty(this.state.inventoryNamespaces) ? (
              <FormGroup label="Database provider" fieldId="db-provider">
                <FormSelect
                  value={selectedDBProvider?.metadata?.name}
                  onChange={this.handleDBProviderSelection}
                  aria-label="Database Provider"
                >
                  {dbProviderOptions.map((option, index) => (
                    <FormSelectOption key={index} value={option.value} label={option.label} />
                  ))}
                </FormSelect>
              </FormGroup>
            ) : null}
          </div>
        ) : (
          <Alert
            variant="warning"
            isInline
            title="Invalid Namespace for Provider Account Creation"
            className="co-alert co-break-word"
          >
            <div>
              To enable imports in this namespace, <a href={configUrl}>create a DBaaSConfig</a>.
            </div>
            {!_.isEmpty(this.state.inventoryNamespaces) ? (
              <div>
                Or switch to one of these valid namespaces and retry:
                <ul>
                  {_.map(this.state.inventoryNamespaces, (namespace, index) => (
                    <li key={index}>{namespace}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>No valid namespaces detected.</div>
            )}
          </Alert>
        )}
        {!_.isEmpty(selectedDBProvider) ? (
          <React.Fragment>
            <FormGroup label="Account Credentials" fieldId="account credentials">
              <HelperText>
                <HelperTextItem variant="indeterminate">
                  These are the credentials of your {selectedDBProvider?.spec?.provider?.displayName} account. To find
                  these credentials, click &nbsp;
                  <Button
                    variant="link"
                    component="a"
                    href={credentialDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<ExternalLinkAltIcon />}
                    iconPosition="right"
                    isInline
                  >
                    here.
                  </Button>
                  &nbsp; Make sure you have whitelisted your IP with the provider if necessary.
                </HelperTextItem>
                &nbsp;
                <HelperTextItem variant="indeterminate">
                  If you do not have a {selectedDBProvider?.spec?.provider?.displayName} account, then you can create
                  one by clicking &nbsp;
                  <Button
                    variant="link"
                    component="a"
                    href={createProviderAccountDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<ExternalLinkAltIcon />}
                    iconPosition="right"
                    isInline
                  >
                    here
                  </Button>
                </HelperTextItem>
              </HelperText>
            </FormGroup>
            {selectedDBProvider?.spec?.credentialFields.map((field) => {
              return (
                <FormGroup
                  label={field.displayName}
                  fieldId={`${selectedDBProvider?.metadata?.name}-${field.key}`}
                  isRequired={field.required}
                  helperTextInvalid="This is a required field"
                  validated={field.isValid}
                  labelIcon={
                    <Popover
                      headerContent={<div>{field.displayName}</div>}
                      bodyContent={
                        <div>
                          <div>
                            The {field.displayName} is the credential associated with your database provider account
                            when you created the account. To retrieve it or to create a new provider account, click on
                            the link below.
                          </div>
                        </div>
                      }
                      footerContent={
                        <Button
                          variant="link"
                          component="a"
                          href={credentialDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          icon={<ExternalLinkAltIcon />}
                          iconPosition="right"
                          isInline
                        >
                          Learn more
                        </Button>
                      }
                    >
                      <button
                        type="button"
                        aria-label="more info"
                        onClick={(e) => e.preventDefault()}
                        aria-describedby="more-info"
                        className="pf-c-form__group-label-help"
                      >
                        <HelpIcon noVerticalAlign />
                      </button>
                    </Popover>
                  }
                >
                  <TextInput
                    isRequired={field.required}
                    type={field.type === 'maskedstring' ? 'password' : 'text'}
                    id={`${selectedDBProvider?.metadata?.name}-${field.key}`}
                    name={`${selectedDBProvider?.metadata?.name}-${field.key}`}
                    value={field.value}
                    validated={field.isValid}
                    onChange={(value) => {
                      field.value = value
                      this.setState((prevState) => {
                        let newCredentials = Object.assign({}, prevState.credentials)
                        newCredentials[field.key] = value.toString('base64')
                        return { credentials: newCredentials }
                      })
                      this.validateField(value, field)
                      this.validateForm()
                    }}
                    onBlur={(event) => {
                      this.validateField(event.target.value, field)
                      this.validateForm()
                    }}
                  />
                </FormGroup>
              )
            })}
          </React.Fragment>
        ) : null}
        <FormGroup
          label="Name"
          fieldId="inventory-name"
          isRequired
          validated={isInventoryNameFieldValid}
          helperTextInvalid={inventoryNameFieldInvalidText}
          labelIcon={
            <Popover
              headerContent="Name"
              bodyContent={
                <div>
                  <div>This name is used to identify your provider account as a friendly name.</div>
                </div>
              }
            >
              <button
                type="button"
                aria-label="more info"
                onClick={(e) => e.preventDefault()}
                aria-describedby="more-info"
                className="pf-c-form__group-label-help"
              >
                <HelpIcon noVerticalAlign />
              </button>
            </Popover>
          }
        >
          <TextInput
            isRequired
            placeholder={`Give a friendly name to your ${providerShortName} account`}
            type="text"
            id="inventory-name"
            name="inventory-name"
            value={inventoryName}
            onChange={(value) => {
              this.setState({ inventoryName: value })
              this.validateInventoryNameField(value)
            }}
            onBlur={(event) => {
              this.validateInventoryNameField(event.target.value)
            }}
            validated={isInventoryNameFieldValid}
          />
        </FormGroup>
        {showError ? (
          <Alert variant="danger" isInline title={error.reason} className="co-alert co-break-word">
            {error.details?.causes ? (
              <ul>
                {_.map(error.details?.causes, (err, index) => (
                  <li key={index}>{err.message}</li>
                ))}
              </ul>
            ) : (
              <div>{error.message}</div>
            )}
          </Alert>
        ) : null}
        <ActionGroup>
          <Button
            variant="primary"
            type="submit"
            className="submit-button"
            isDisabled={_.isEmpty(selectedDBProvider) || !isFormValid}
          >
            Import
          </Button>
          <Button variant="secondary" onClick={this.handleCancel}>
            Cancel
          </Button>
        </ActionGroup>
      </Form>
    )
  }
}

export default ProviderAccountForm
